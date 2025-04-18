<!-- ---
author: Natalie Klestrup Röijezon, translated by Hantong Chen
title: "从头开始异步 (1): Future 到底是什么?"
pubDatetime: 2025-04-19T23:00:00.000+08:00
# modDatetime:
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: ""
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 595 期
>
> 本文翻译自 Natalie Klestrup Röijezon 的博客文章 [https://natkr.com/2025-04-10-async-from-scratch-1/](https://natkr.com/2025-04-10-async-from-scratch-1/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 4 月 19 日晚, 于北京.

(翻译中)
