#!/usr/bin/env python3
"""QLoRA fine-tune of Qwen3 (default 4B) on the samples written by export-sft.js, with Unsloth.

Run it on a GPU box (4B at 16k context wants a 24 GB card; a 16 GB T4 may need --max-seq-len 12288 and shorter prompts, see the notes below), NOT on the CPU-only machine:

    pip install unsloth                       # Colab/Kaggle: the notebook installs it for you
    python train_sft.py --data sft/ --out qwen3-4b-minecraft
    python train_sft.py --data sft/ --out qwen3-4b-minecraft --gguf q4_k_m     # also write a GGUF for Ollama/llama.cpp

Check the data side first (needs only `pip install transformers jinja2`, no GPU):

    python train_sft.py --data sft/ --prepare-only

Input: <data>/train.jsonl and optional <data>/val.jsonl, "prompt-completion" format (the export-sft.js default):
    {"prompt": [chat messages], "completion": [one assistant message], "tools": [...]}

How the loss is masked: each sample is rendered with the Qwen3 chat template (tools included, thinking OFF, because the
student runs /no_think). The text up to the generation prompt is the prompt, the rest is the completion; only
completion tokens (the assistant's short sentence + tool call + <|im_end|>) are trained on.

Memory/speed note: every prompt carries the tool list. With the compact list (ollama-agent.js default; see
tools-compact.js) that is roughly 2.3k tokens instead of 6.6k for the full MCP descriptions. Train on exactly the tool
list you will run with: record without --full-tools, or re-export older recordings with export-sft.js --compact-tools.
"""
import argparse
import json
import os
import random
import sys


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", required=True, help="directory with train.jsonl (and val.jsonl)")
    p.add_argument("--out", default="qwen3-4b-minecraft", help="output directory (LoRA adapter goes to <out>/lora)")
    p.add_argument("--model", default="unsloth/Qwen3-4B", help="base model; unsloth/Qwen3-1.7B or -8B work the same way")
    p.add_argument("--max-seq-len", type=int, default=16384, help="longer samples are dropped. The 25-tool list alone is ~6.6k tokens of every prompt, so 16384 matches the agent's --ctx; lower it only if you also shrink the prompts")
    p.add_argument("--epochs", type=float, default=2.0)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=16)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--seed", type=int, default=3407)
    p.add_argument("--max-samples", type=int, default=0, help="debug: use only the first N train samples")
    p.add_argument("--prepare-only", action="store_true", help="tokenize, print statistics and a decoded example, then exit (no GPU/unsloth needed)")
    p.add_argument("--gguf", nargs="?", const="q4_k_m", default=None, metavar="QUANT", help="after training also export a GGUF (default q4_k_m)")
    return p.parse_args()


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def render(tokenizer, sample):
    """Returns (prompt_text, completion_text) or None when the template does not extend the prompt cleanly."""
    prompt, completion, tools = sample["prompt"], sample["completion"], sample.get("tools")
    kw = dict(tools=tools, tokenize=False, enable_thinking=False)
    prompt_text = tokenizer.apply_chat_template(prompt, add_generation_prompt=True, **kw)
    full_text = tokenizer.apply_chat_template(prompt + completion, **kw)
    if not full_text.startswith(prompt_text):
        return None
    # The template ends the assistant turn with "<|im_end|>\n"; the trailing newline is not something to learn.
    return prompt_text, full_text[len(prompt_text):].rstrip("\n")


def tokenize_samples(tokenizer, samples, max_len, label):
    rows, dropped = [], {"template-mismatch": 0, "too-long": 0}
    for s in samples:
        r = render(tokenizer, s)
        if r is None:
            dropped["template-mismatch"] += 1
            continue
        p_ids = tokenizer(r[0], add_special_tokens=False)["input_ids"]
        c_ids = tokenizer(r[1], add_special_tokens=False)["input_ids"]
        if len(p_ids) + len(c_ids) > max_len:
            dropped["too-long"] += 1
            continue
        rows.append({"input_ids": p_ids + c_ids, "labels": [-100] * len(p_ids) + c_ids, "n_prompt": len(p_ids)})
    kept = len(rows)
    lens = sorted(len(r["input_ids"]) for r in rows) or [0]
    comp = sum(len(r["input_ids"]) - r["n_prompt"] for r in rows)
    if samples and kept < len(samples) / 2:
        print(f"WARNING [{label}]: more than half the samples were dropped; raise --max-seq-len or shorten the prompts (tool list, trim window)")
    print(f"[{label}] {len(samples)} samples -> kept {kept}, dropped {dropped}; "
          f"tokens/sample median {lens[len(lens) // 2]}, max {lens[-1]}; trained tokens total {comp}")
    return rows


def main():
    a = parse_args()
    random.seed(a.seed)
    train = read_jsonl(os.path.join(a.data, "train.jsonl"))
    val = read_jsonl(os.path.join(a.data, "val.jsonl"))
    if not train:
        sys.exit(f"no samples in {a.data}/train.jsonl")
    if a.max_samples:
        train = train[: a.max_samples]

    from transformers import AutoTokenizer

    if a.prepare_only:
        tokenizer = AutoTokenizer.from_pretrained(a.model)
        train_rows = tokenize_samples(tokenizer, train, a.max_seq_len, "train")
        tokenize_samples(tokenizer, val, a.max_seq_len, "val") if val else None
        if train_rows:
            ex = train_rows[len(train_rows) // 2]
            tail = ex["input_ids"][ex["n_prompt"]:]
            print("\n--- example: end of prompt ---\n" + tokenizer.decode(ex["input_ids"][max(0, ex["n_prompt"] - 60): ex["n_prompt"]]))
            print("--- example: trained completion ---\n" + tokenizer.decode(tail))
        return

    from unsloth import FastLanguageModel  # imported first so its patches apply before transformers loads

    import torch
    from transformers import DataCollatorForSeq2Seq, Trainer, TrainingArguments

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=a.model, max_seq_length=a.max_seq_len, load_in_4bit=True, dtype=None,
    )
    train_rows = tokenize_samples(tokenizer, train, a.max_seq_len, "train")
    val_rows = tokenize_samples(tokenizer, val, a.max_seq_len, "val") if val else []
    if not train_rows:
        sys.exit("nothing left to train on after filtering")
    strip = lambda rows: [{"input_ids": r["input_ids"], "attention_mask": [1] * len(r["input_ids"]), "labels": r["labels"]} for r in rows]

    from datasets import Dataset

    train_ds = Dataset.from_list(strip(train_rows)).shuffle(seed=a.seed)
    val_ds = Dataset.from_list(strip(val_rows)) if val_rows else None

    model = FastLanguageModel.get_peft_model(
        model, r=a.lora_r, lora_alpha=a.lora_alpha, lora_dropout=0, bias="none",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth", random_state=a.seed,
    )

    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    args = TrainingArguments(
        output_dir=os.path.join(a.out, "checkpoints"),
        per_device_train_batch_size=a.batch_size, gradient_accumulation_steps=a.grad_accum,
        num_train_epochs=a.epochs, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_ratio=0.05,
        weight_decay=0.01, optim="adamw_8bit", bf16=bf16, fp16=not bf16, logging_steps=5,
        eval_strategy="epoch" if val_ds is not None else "no", save_strategy="epoch", save_total_limit=2,
        seed=a.seed, report_to="none", remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model, args=args, train_dataset=train_ds, eval_dataset=val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )
    trainer.train()

    lora_dir = os.path.join(a.out, "lora")
    model.save_pretrained(lora_dir)
    tokenizer.save_pretrained(lora_dir)
    print(f"saved LoRA adapter to {lora_dir}")
    if a.gguf:
        gguf_dir = os.path.join(a.out, "gguf")
        model.save_pretrained_gguf(gguf_dir, tokenizer, quantization_method=a.gguf)
        print(f"saved GGUF ({a.gguf}) to {gguf_dir}; load it in Ollama with a Modelfile (FROM <file>.gguf)")


if __name__ == "__main__":
    main()
