<!-- ---
author: Oleksandr Prokhorenko, translated by Hantong Chen
title: "Rust 类型系统: 从 GAT 到类型擦除的深入探讨"
pubDatetime: 2025-04-20T01:38:00.000+08:00
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
> 本文翻译自 Oleksandr Prokhorenko 的博客文章 [https://minikin.me/blog/rust-type-system-deep-dive](https://minikin.me/blog/rust-type-system-deep-dive), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 4 月 19 日晚, 于北京.

# Rust Type System Deep Dive From GATs to Type Erasure

Rust 类型系统: 从泛型关联类型 (Generic Associated Types, GAT) 到类型擦除的深入探讨

## TOC

(译者注: mdBook 的目录支持不行, 手动一下吧)

- [Generic Associated Types (GATs) | 泛型关联类型](#generic-associated-types-gats--泛型关联类型)
- [Advanced Lifetime Management | 高级生命周期管理](#advanced-lifetime-management--高级生命周期管理)
- [Phantom Types | 虚类型](#phantom-types--虚类型)
- [The Typeclass Patterns | 类型类模式](#the-typeclass-pattern--类型类模式)
- [Zero-Sized Types (ZSTs) | 零大小类型](#zero-sized-types-zsts--零大小类型)
- [Type Erasure Patterns | 类型擦除模式](#type-erasure-patterns--类型擦除模式)


## Introduction | 前言

Have you ever stared at a complex Rust error involving lifetimes and wondered if there’s a way to bend the type system to your will? Or perhaps you’ve built a library that relied on runtime checks, wishing you could somehow encode those constraints at compile time?

在遇到一个涉及生命周期的复杂 Rust 错误时, 你曾否红温, 想知道是否有办法让类型系统按照你的意愿让步? 或者, 也许您已经构建了一个依赖于运行时检查的库, 希望可以在编译时以某种方式对这些约束进行编码?

__You’re not alone.__

__您并不孤单.__

Rust’s type system is like an iceberg — most developers only interact with the visible 10% floating above the water. But beneath the surface lies a world of powerful abstractions waiting to be harnessed.

Rust 的类型系统就像一座冰山, 大多数开发人员只与漂浮在水面上的可见部分交互, 这部分可能仅占一成. 在水面下, 隐藏着一个等待被利用的强大抽象世界.

In this post, we’ll dive deep beneath the surface to explore five advanced type system features that can transform how you design Rust code:

在这篇文章中, 我们将深入探讨水面下的五个高级类型系统功能, 它们可以改变你设计 Rust 代码的方式:

- **Generic Associated Types (GATs)** — The feature that took 6+ years to stabilize, enabling entirely new categories of APIs

  **泛型关联类型（GATs）**: 这一历时 6 年多才得以稳定的特性, 为 API 带来全新的可能性

- **Advanced Lifetime Management** — Techniques to express complex relationships between references

  **高级生命周期管理**: 引用之间复杂的生命周期关联

- **Phantom Types** — Using "ghost" type parameters to encode states with zero runtime cost

  **虚类型**: 使用鬼魂般的类型参数定义状态, 而运行时的成本为零

- **Typeclass Patterns** — Bringing functional programming’s power to Rust’s trait system

  **类型类模式**: 函数式编程赋能 Rust 的 trait 系统

- **Zero-Sized Types (ZSTs)** — Types that exist only at compile time but provide powerful guarantees

  **零大小类型**: 仅在编译时存在但提供强大保证的类型

- **Type Erasure Techniques** — Methods to hide implementation details while preserving behavior

  **类型擦除**: 在保留类型行为时隐藏实现细节.

Why should you care about these advanced patterns? Because they represent the difference between:

为什么您应该关注这些高级模式? 因为它们代表了以下两者之间的区别:

- Runtime checks vs. compile-time guarantees

  运行时检查 vs 编译时保证

- Documentation comments vs. compile errors for incorrect usage

  文档注释 vs 错误使用时的强制编译错误

- Hoping users read your docs vs. ensuring they can’t misuse your API

  希望用户阅读您的文档与确保他们不会滥用您的 API

Let’s begin our journey into the depths of Rust’s type system. By the end, you’ll have new tools to craft APIs that are both more expressive and more robust.

让我们开始深入了解 Rust 类型系统的旅程吧. 到最后, 您将拥有新的工具来给出更具表现力和更健壮的 API.

## Generic Associated Types (GATs) | 泛型关联类型

### The Long Road to Stabilization | 通往稳定的漫漫长路

"Is it possible to define a trait where the associated type depends on the self lifetime?"

"是否可以定义一个 trait, 其关联类型取决于 self 的生命周期?"

This seemingly innocent question, asked over and over in the Rust community for years, pointed to a critical gap in Rust’s type system. Generic Associated Types (GATs) represent one of Rust’s most anticipated features, finally stabilized in Rust 1.65 after more than six years in development.

这个看似平平无奇的问题, 在 Rust 社区中被一遍又一遍地问了多年, 它指出了 Rust 类型系统中的一个关键差距. 泛型关联类型 (GAT) 是 Rust 最受期待的功能之一, 经过六年多的开发, 终于在 Rust 1.65 中稳定下来.

The journey to stabilization wasn’t just a matter of implementation — it involved fundamental questions about Rust’s type system design. You might wonder: what kind of feature takes more than half a decade to implement? The answer: one that touches the very core of how generics, traits, and lifetimes interact.

这不仅仅是一个实现问题: 它涉及关于 Rust 类型系统设计的基本问题. 您可能想知道: 什么样的功能需要五年多的时间才能实现? 答案是, 一个触及泛型、特质 (trait) 和生命周期如何交互的核心功能.

### What Are GATs? | 泛型关联类型是什么?

Before GATs, you found yourself trapped in situations like this:

在没有 GAT 的时候, 您可能遇到这样的情况:

```rust
trait Container {
    type Item;

    fn get(&self) -> Option<&Self::Item>;
}
```

This seems reasonable until you try implementing it for a type like `Vec<T>`:

看上去没问题, 直到您尝试为像 `Vec<T>` 这样的类型实现它:

```rust,no_run
impl<T> Container for Vec<T> {
    type Item = T;

    fn get(&self) -> Option<&Self::Item> {
        // Wait... this doesn't quite work!
        // The lifetime of the returned reference comes from `&self`
        // but our associated type doesn't know about that lifetime
        self.first()
    }
}
```

With GATs, we can make associated types aware of lifetimes:

使用 GAT, 我们可以让关联类型知道生命周期:

```rust
trait Container {
    type Item<'a>
    where
        Self: 'a;
    fn get<'a>(&'a self) -> Option<Self::Item<'a>>;
}

impl<T> Container for Vec<T> {
    type Item<'a>
        = &'a T
    where
        Self: 'a;

    fn get<'a>(&'a self) -> Option<Self::Item<'a>> {
        self.first()
    }
}
```

This seemingly small addition unlocks entirely new categories of APIs that were previously impossible or required unsafe workarounds.

这个看似很小的新增功能解锁了以前不可能或需要不安全解决方法的全新 API 类别.

> [!TIP]
> **Key Takeaway**
>
> GATs let you create associated types that can reference the lifetime of `&self`, allowing for APIs that were previously impossible to express safely.
>
> **划重点**
>
> GAT 允许您创建可以引用 `&self` 生命周期的关联类型, 从而让以前无法以 safe 方法表达的 API 成为可能.

(译者注: 这点或许那些 2021 edition 入坑的 Rust 开发者感受不深了, 包括我)

Real-world Example: A Collection Iterator Factory

实际示例: 集合迭代器工厂模式

Let’s see how GATs enable elegant APIs for creating iterators with different lifetimes:

让我们看看 GAT 如何让我们能提供优雅的 API 来创建具有不同生命周期的迭代器:

```rust
trait CollectionFactory {
    type Collection<'a> where Self: 'a;
    type Iterator<'a>: Iterator where Self: 'a;

    fn create_collection<'a>(&'a self) -> Self::Collection<'a>;
    fn iter<'a>(&'a self) -> Self::Iterator<'a>;
}

struct VecFactory<T>(Vec<T>);

impl<T: Clone> CollectionFactory for VecFactory<T> {
    type Collection<'a> = Vec<T> where T: 'a;
    type Iterator<'a> = std::slice::Iter<'a, T> where T: 'a;

    fn create_collection<'a>(&'a self) -> Vec<T> {
        self.0.clone()
    }

    fn iter<'a>(&'a self) -> std::slice::Iter<'a, T> {
        self.0.iter()
    }
}
```

Before GATs, this pattern would have required boxing, unsafe code, or simply wouldn’t have been possible. Now it’s type-safe and zero-cost.

在 GAT 实装前, 这种模式需要装箱 (Box 堆分配)、编写 unsafe 代码, 或者根本不可能. 现在, 它是类型安全且零成本的.

Think of GATs as the tool that lets you build APIs that adapt to their context — rather than forcing users to adapt to your API.

将 GAT 视为一种工具, 可让您构建适应其上下文的 API, 而不是强迫用户适应您的 API.

## Advanced Lifetime Management | 高级生命周期管理

Lifetimes in Rust are like the air we breathe — essential, ever-present, but often invisible until something goes wrong. Advanced lifetime management gives you the tools to work with this invisible force.

Rust 中的生命周期就像我们呼吸的空气, 是必不可少的、永恒的, 但直到出现问题之前都难被被意识到的存在. 高级生命周期管理为您提供了与这股无形力量合作的工具.

### Higher-Rank Trait Bounds (HRTBs)

(译者注: 专有名词组合, 不译, 后面简称 HRTB)

You’ve likely encountered this cryptic syntax before, maybe in compiler errors:

您以前可能遇到过这种神秘的语法, 可能是在编译器错误提示中:

```for<'a> T: Trait<'a>```

This strange-looking for<'a> is the gateway to higher-rank trait bounds. But what does it actually mean?

这个看起来很奇怪的 `for<'a>` 是通往更高等级 trait 约束的门户. 但它实际上意味着什么?

Imagine you’re writing an API to parse strings:

假设您正在编写一个 API 来解析字符串, (伪代码如下):

```rust,no_run
trait Parser {
    fn parse(&self, input: &str) -> Output;
}
```

But wait — the input’s lifetime is tied to the function call, not the trait definition. Traditional generics can’t express this relationship properly. Instead, we need HRTBs:

但是等等: 我们期望的是输入的生命周期与函数调用相关联, 而不是 trait 的定义. 传统泛型无法正确表达这种关系. 在这种情况下, 我们需要 HRTB:

```rust,no_run
trait Parser {
    fn parse<F, O>(&self, f: F) -> O
    where
        F: for<'a> FnOnce(&'a str) -> O;
}
```

Now we can implement the `Parser` trait for our `SimpleParser`:

现在我们可以为 `SimpleParser` 实现 `Parser` trait:

```rust,no_run
struct SimpleParser;

impl Parser for SimpleParser {
    fn parse<F, O>(&self, f: F) -> O
    where
        F: for<'a> FnOnce(&'a str) -> O,
    {
        let data = "sample data";
        f(data)
    }
}
```

The `for<'a>` syntax is a universal quantification over lifetimes, meaning "for all possible lifetimes ‘a". It’s saying that F must be able to handle a string slice with any lifetime, not just a specific one determined in advance.

`for<'a>` 语法是生命周期的通用量化, 含义是 "对于所有可能的生命周期 `'a`"...

> [!TIP] 
>
> **译者碎碎念**
>
> 这里的例子写得莫名其妙的.
>
> 请看最简单的代码示例, 可以尝试运行看看报什么错:
>
> ```rust,compile_fail
> fn call_on_ref_zero<'a, F>(f: F)
> where
>    F: Fn(&'a i32)
> {
>     let zero = 0;
>     f(&zero);
> }
> ```
>
> 能看出来问题吗? `F` 接受的引用生命周期和 `call_on_ref_zero` 关联, 引用至少得活得比 `call_on_ref_zero` 执行时全程一样久.
>
> 问题来了: `call_on_ref_zero` 函数块内的局部变量呢? 这就和我们的设计要求不符合了.
>
> 修改方法很简单:
>
> ```rust
> fn call_on_ref_zero<F>(f: F)
> where
>      F: for <'a> Fn(&'a i32)
> {
>     let zero = 0;
>     f(&zero);
> }
> ```
>
> 含义是告诉编译器, `Fn` 接受的引用 比 `Fn` 活得久就行(接受任意可能的生命周期 `'a`).
>
> 这就是所谓 HRTB.

> [!TIP] 
>
> 🔑 Key Takeaway: Higher-rank trait bounds let you express relationships between lifetimes that can’t be captured with simple lifetime parameters, enabling more flexible APIs.
>
> 🔑 关键要点: HRTB 允许您表达生命周期之间的关系, 这些关系本无法使用简单的生命周期参数捕获. 从而实现更灵活的 API.

### Lifetime Variance and `'static` | 生命周期型变和 `'static`

> [!TIP]
>
> **译者注**
>
> `variance` 中文译法不一, 此处译为 `型变`.
>
> 本节搭配 Rust 死灵书对应 `子类型和型变` 章节阅读更佳.

Imagine you’re designing an authentication system:

假设您正在设计一个身份验证系统:

```rust
struct AdminToken<'a>(&'a str);
struct UserToken<'a>(&'a str);

fn check_admin_access(token: AdminToken) -> bool {
    // Verification logic
    true
}
```

A critical question arises: Could someone pass a `UserToken` where an `AdminToken` is required? The answer depends on variance.

一个关键问题出现了: 有人可以在需要 `AdminToken` 的地方传递 `UserToken` 吗? 答案取决于型变 (variance).

> [!TIP]
>
> **译者注**
>
> 可能这里看着有点莫名其妙, 这不显而易见不是一个类型吗? 不过请耐心看下去.

Variance determines when one type can be substituted for another based on their lifetime relationships:

型变根据类型的生命周期关系确定何时可以将一种类型替换为另一种类型:

- Covariant: If `'a` outlives `'b`, then `T<'a>` can be used where `T<'b>` is expected (most common)

  协变 (covariant): 最常见的情况是, 若 `'a` 比 `'b` 长寿, 则可以在预期 `T<'b>` 的地方使用 `T<'a>`

- Contravariant: The opposite relationship

  逆变 (contravariant): 相反的关系.

- Invariant: No substitution is allowed (critical for security)

  不变 (invariant): 不允许替换 (对安全性至关重要).

For example, `&'a T` is covariant over `'a`, meaning you can use a longer-lived reference where a shorter-lived one is expected:

例如, `&'a T` 的 `'a` 是协变的, 这意味着你可以使用寿命较长的引用, 而预期引用的引用寿命较短:

```rust
fn needs_short_lived<'a, 'b: 'a>(data: &'a u32) {
    // Some code
}


fn provide_longer_lived<'long>(long_lived: &'long u32) {
    needs_short_lived(long_lived); // This works because of covariance
}
```

Understanding these relationships becomes essential when designing APIs that deal with sensitive resources or complex lifetime interactions.

在设计处理敏感资源或复杂生命周期交互的 API 时, 了解这些关系变得至关重要.

#### 译者补充

这里非常抽象, 再次建议搭配 _Rust 死灵书 - 子类型与型变_ 一节阅读.

子类型化是隐式的, 可以出现在类型检查或类型推断的任何阶段.

Rust 中的子类型化的概念仅出现在和生命周期的型变以及 HRTB 这两个地方. 如果我们擦除了类型的生命周期, 那么唯一的子类型化就只是类型相等 (type equality) 了.

对于两个生命周期 'a, 'b: 更长寿那个被称为子类型, 更短寿那个被称为父类型. 子类型化规则是**可以生命周期相对短的地方使用生命周期长的类型(用父类型代替子类型)**:

```rust
fn bar<'a>() {
    let s: &'static str = "hi";
    let t: &'a str = s;
}
```

上面的例子, `s` 具备最长的生命周期 (`'static`), 但我们能在要求的生命周期更短的地方使用它, 这就是所谓的子类型化.

类似地: trait 类似:

```rust
// 这里 'a 被替换成了 'static
let subtype: &(for<'a> fn(&'a i32) -> &'a i32) = &((|x| x) as fn(&_) -> &_);
let supertype: &(fn(&'static i32) -> &'static i32) = subtype;

// 显然地, 我们也可以用一个 HRTB 来代替另一个, 这里可以理解为 'c 同时是 'a  和 'b 的子类型
let subtype: &(for<'a, 'b> fn(&'a i32, &'b i32))= &((|x, y| {}) as fn(&_, &_));
let supertype: &for<'c> fn(&'c i32, &'c i32) = subtype;

// 这对于 trait 对象也是类似的. 注意 Fn 大写 F 是个 trait 哦.
let subtype: &(for<'a> Fn(&'a i32) -> &'a i32) = &|x| x;
let supertype: &(Fn(&'static i32) -> &'static i32) = subtype;
```

泛型类型在它的某个参数上的*型变*描述了该参数的子类型化去如何影响此泛型类型的子类型化.

前面提到:

> 对于两个生命周期 'a, 'b: 更长寿那个被称为子类型, 更短寿那个被称为父类型. 子类型化规则是**可以生命周期相对短的地方使用生命周期长的类型(用父类型代替子类型)**

这种子类型化规则被称为`协变`, 反之则为`逆变`, 不能代替则为`不变`.

在单个生命周期子类型化规则的基础上, 一些常见的泛型类型的型变规则如表格所示:

|                 |  'a  |     T    |   U  |
|-----------------|:----:|:--------:|:----:|
| `&'a T `        | 协变 | 协变     |      |
| `&'a mut T`     | 协变 | 不变     |      |
| `Box<T>`        |      | 协变     |      |
| `Vec<T>`        |      | 协变     |      |
| `UnsafeCell<T>` |      | 不变     |      |
| `Cell<T>`       |      | 不变     |      |
| `fn(T) -> U`    |      | **逆**变 | 协变 |
| `*const T`      |      | 协变     |      |
| `*mut T`        |      | 不变     |      |

- 不可变引用 `&'a T ` 中的 `T` 遵循 **`协变`** 的规则.

  作为泛型参数, `T` 自然也可以是一个引用之类的玩意, `T` 是实际类型不是引用咱不说(擦除生命周期了),
  以 `&'m K` 和 `&'n K` 为例, 已知 `'m` 比 `'n` 长寿, 根据协变的规则, `&'a &'m T` 可以代替 `&'a &'n T` 用在要求参数 `&'a &'n T` 的地方.

  不可变原始指针 `*const T` 和不具有内部可变性的 `Box<T>` 等智能指针具有类似行为.
- 可变引用 `&'a mut T` 中的 `T` 遵循 **`不变`** 的规则,

  可变原始指针 `*mut T` 和具有内部可变性 `UnsafeCell`, `Cell` 的智能指针具有类似行为.
- 非常特殊地, 语言中仅有的 **`逆变`** 来自函数参数, 背后机制过于复杂, 译者也不会 (*^_^*).
- 结构体、枚举、联合体 (union) 和元组 (tuple) 内的泛型参数的型变规则由其所有使用到该泛型参数的字段的型变关系联合决定.

  如果参数用在了多处且具有不同型变关系的位置上, 则该类型在该参数上是不变的.
  
  例如, 下面示例的结构体在 `'a` 和 `T` 上是协变的, 在 `'b` 和 `U` 上是不变的.

  ```rust
  use std::cell::UnsafeCell;
  struct Variance<'a, 'b, T, U: 'a> {
      x: &'a U,               // 整个结构体在 'a 上是协变的
      y: *const T,            // 在 T 上是协变的
      z: UnsafeCell<&'b f64>, // 在 'b 上是不变的
      w: *mut U,              // 虽然 &'a U 在 U 上是协变的, 但这里在 U 上是不变的, 导致整个结构体在 U 上是不变的
  }
  ```

## Phantom Types | 虚类型

Have you ever wished you could distinguish between two values of the same type but with different meanings? Consider these examples:

您是否曾经希望能够区分相同类型但含义不同的两个值? 请考虑以下示例:

```
// These are all just strings, but they have very different meanings!
let user_id = "usr_123456";
let order_id = "ord_789012";
let coupon_code = "KFCV50";
```

Nothing prevents you from accidentally mixing them up. This is where phantom types come in — they let you create type-level distinctions without runtime cost.

没有什么能阻止您不小心将它们混淆. 这就是虚类型的用武之地: 它们允许您创建类型差异, 而无需运行时成本.

Phantom types are type parameters that don’t appear in the data they parameterize:

虚类型是不会出现在它们参数化的数据中的类型参数:

```rust
use std::marker::PhantomData;

struct Token<State> {
    value: String,
    _state: PhantomData<Role>,
}
```

The `PhantomData<State>` field takes no space at runtime, but it creates a distinct type at compile time.

`PhantomData<State>` 字段在运行时不占用空间, 但它在编译时创建一个特定的类型.

> [!TIP]
>
> 🔑 Key Takeaway: Phantom types allow you to encode additional information in the type system without adding any runtime overhead, creating distinctions that exist purely at compile time.
>
> 🔑 关键要点: 虚类型允许您充分利用类型系统制造纯粹在编译时存在的区别以实现特定功能, 而不会增加任何运行时开销.

### State Machines at Compile Time | 编译时状态机

One of the most powerful applications of phantom types is encoding state machines directly in the type system:

虚类型最强大的应用之一是直接在类型系统中对状态机进行编码:

```rust,editable
use std::marker::PhantomData;

struct Token<State> {
    value: String,
    _state: PhantomData<State>,
}

// States (empty structs)
struct Unvalidated;
struct Validated;

#[derive(Debug)]
// Validation error type
enum ValidationError {
    TooShort,
    InvalidFormat,
}

impl Token<Unvalidated> {
    fn new(value: String) -> Self {
        Token {
            value,
            _state: PhantomData,
        }
    }

    fn validate(self) -> Result<Token<Validated>, ValidationError> {
        // Perform validation
        if self.value.len() > 3 {
            Ok(Token {
                value: self.value,
                _state: PhantomData,
            })
        } else {
            Err(ValidationError::TooShort)
        }
    }
}

impl Token<Validated> {
    fn get(&self) -> &str {
        // Only callable on validated tokens
        &self.value
    }
}

fn main() {
    let token = Token::new("Hello".into());

    // 尝试注释这行再运行, 看看会报什么错!
    let token = token.validate().unwrap();

    println!("{}", token.get());
}
```

This pattern ensures that `get()` can only be called on tokens that have passed validation, with the guarantee enforced at compile time.

此模式确保 `get()` 只能在已通过验证的令牌上调用, 并在编译时强制执行保证.

### Type-Level Validation | 类型级别的验证

Phantom types can encode domain-specific rules at the type level, essentially moving validation from runtime to compile time:

虚类型可以在类型级别指定特定规则, 实质上是将验证从运行时转移到编译时:

```rust
# use std::marker::PhantomData;
#
struct UserId<Validated>(String, PhantomData<Validated>);
struct EmailAddress<Validated>(String, PhantomData<Validated>);

struct Unverified;
struct Verified;

trait Validator<T> {
    type Error;
    fn validate(value: String) -> Result<T, Self::Error>;
}

struct UserIdValidator;
impl Validator<UserId<Verified>> for UserIdValidator {
    type Error = String;

    fn validate(value: String) -> Result<UserId<Verified>, Self::Error> {
        if value.len() >= 3 && value.chars().all(|c| c.is_alphanumeric()) {
            Ok(UserId(value, PhantomData))
        } else {
            Err("Invalid user ID".to_string())
        }
    }
}

// Now functions can require verified types
fn register_user(id: UserId<Verified>, email: EmailAddress<Verified>) {
    // We know both ID and email have been validated
}
```

This approach creates a "validation firewall" — once data passes through validation, its type guarantees it’s valid throughout the rest of your program.

这种方法创建了一个 "验证防火墙": 一旦数据通过验证, 其类型就会保证它在程序的其余部分都有效.

## The Typeclass Pattern | 类型类模式

What if you could define behavior for types you don’t control?

如果您可以为不受您控制的类型定义行为, 那会怎样?

Haskell programmers have long enjoyed typeclasses, a powerful mechanism for defining interfaces that types can implement. Rust’s trait system offers similar capabilities, but we can go further to implement true typeclass-style programming.

Haskell 程序员长期以来一直喜欢类型类, 这是一种用于定义类型可以实现的接口的强大机制. Rust 的 trait 系统提供了类似的功能, 但我们可以更进一步地实现真正的类型类风格的编程.

What Are Typeclasses?

什么是类型类?

Imagine you’re building a serialization library and want to support many different formats. Without typeclasses, you’d need to:

假设您正在构建一个序列化库, 并希望支持许多不同的格式. 如果没有类型类, 你需要:

- Create a trait

  创建一个 trait

- Implement it for every type you own

  为您拥有的每种类型实施它

- Hope other library authors implement it for their types

  希望其他库作者为他们的类型实现它

- Resort to newtype wrappers for types you don’t control

  对你无法控制的类型求助于 newtype 包装器

In functional languages like Haskell, typeclasses solve this elegantly by allowing you to define behavior for any type, even ones you didn’t create. Rust’s trait system gives us similar power through "orphan implementations" (with some restrictions).

在像 Haskell 这样的函数式语言中, 类型类允许你为任何类型的类型定义行为, 即使是那些不是你创建的, 从而优雅地解决了这个问题. Rust 的 trait 系统通过 "孤儿实现" (有一些限制) 为我们提供了类似的能力.

The key components of typeclass patterns in Rust are:

Rust 中类型类模式的关键组件是:

- Traits as interfaces

  作为接口的 trait

- Trait implementations for existing types (including foreign types)

  现有类型 (包括外部类型) 的 trait 实现

- Associated types or type parameters for related types

  相关类型的关联类型或类型参数

- Trait bounds to express constraints

  用于表达约束的 trait 限定

> [!TIP]
>
> 🔑 Key Takeaway: Typeclasses let you add behavior to types after they’re defined, enabling powerful generic programming.
>
> 🔑 关键要点: 类型类允许您在定义类型后向类型添加行为, 从而实现强大的泛型编程.

### From Monoids to Semigroups | 从幺半群到半群

Let’s dive into some algebraic abstractions to see typeclasses in action:

让我们深入研究一些代数抽象, 看看类型类的实际应用:

```rust,no_run
trait Semigroup {
    fn combine(&self, other: &Self) -> Self;
}

trait Monoid: Semigroup + Clone {
    fn empty() -> Self;
}

// Implementing for built-in types
impl Semigroup for String {
    fn combine(&self, other: &Self) -> Self {
        let mut result = self.clone();
        result.push_str(other);
        result
    }
}

impl Monoid for String {
    fn empty() -> Self {
        String::new()
    }
}

// Product and Sum types for numbers
#[derive(Clone)]
struct Product<T>(T);

#[derive(Clone)]
struct Sum<T>(T);

impl<T: Clone + std::ops::Mul<Output = T>> Semigroup for Product<T> {
    fn combine(&self, other: &Self) -> Self {
        Product(self.0.clone() * other.0.clone())
    }
}

impl<T: Clone + std::ops::Mul<Output = T> + From<u8>> Monoid for Product<T> {
    fn empty() -> Self {
        Product(T::from(1))
    }
}

impl<T: Clone + std::ops::Add<Output = T>> Semigroup for Sum<T> {
    fn combine(&self, other: &Self) -> Self {
        Sum(self.0.clone() + other.0.clone())
    }
}

impl<T: Clone + std::ops::Add<Output = T> + From<u8>> Monoid for Sum<T> {
    fn empty() -> Self {
        Sum(T::from(0))
    }
}
```

You might be thinking: "That looks like a lot of boilerplate just to add strings or multiply numbers." But the magic happens when we build generic algorithms that work with any type that implements our traits.

您可能会想: "这看起来就像很多样板, 只是为了添加字符串或乘以数字." 但是, 当我们构建适用于实现我们 trait 的任何类型的通用算法时, 奇迹就会发生.

### Leveraging Typeclasses for Generic Algorithms | 将类型类用于泛型算法

Once we have these abstractions, we can write algorithms that work with any Monoid, regardless of the actual data type:

一旦我们有了这些抽象, 我们就可以编写适用于任何幺半群的算法, 而不管实际数据类型如何:

```rust,no_run
fn combine_all<M: Monoid + Clone>(values: &[M]) -> M {
    values.iter().fold(M::empty(), |acc, x| acc.combine(x))
}

// Usage
let strings = vec![String::from("Hello, "), String::from("typeclasses "), String::from("in Rust!")];
let result = combine_all(&strings);
// "Hello, typeclasses in Rust!"

let numbers = vec![Sum(1), Sum(2), Sum(3), Sum(4)];
let sum_result = combine_all(&numbers);
// Sum(10)

let products = vec![Product(2), Product(3), Product(4)];
let product_result = combine_all(&products);
// Product(24)
```

With just a few lines of code, we’ve created a function that can concatenate strings, sum numbers, multiply numbers, or work with any other type that follows the Monoid abstraction. This is the power of typeclass-based programming!

只需几行代码, 我们就创建了一个函数, 它可以连接字符串、求和、乘以数字, 或者使用遵循幺半群抽象的任何其他类型. 这就是基于类型类的编程的强大之处！

## Zero-Sized Types (ZSTs) | 零大小类型

Zero-sized types (ZSTs) are types that occupy no memory at runtime but carry semantic meaning at compile time. They’re a powerful tool for type-level programming without runtime overhead.

零大小类型 （ZST） 是在运行时不占用内存但在编译时具有语义含义的类型. 它们是类型级编程的强大工具, 无运行时开销.

### What Are Zero-Sized Types? | 什么是零大小类型?

A ZST is any type that requires 0 bytes of storage. Common examples include:

ZST 是不需要任何存储空间的任何类型. 常见示例包括:

- Empty structs: `struct Marker;`

  空结构体: `struct Marker;`

- Empty enums: `enum Void {}`

  空枚举: `enum Void {}`

- `PhantomData`: `PhantomData<T>`

- Unit type: `()`

  单元类型: `()`

Despite taking no space, ZSTs provide valuable type information to the compiler.

尽管不占用空间, 但 ZST 为编译器提供了有价值的类型信息.

### Marker Types | 标记类型

One common use of ZSTs is as marker types to implement compile-time flags:

ZST 的一个常见用途是作为标记类型来实现编译时标志:

```rust,no_run
// Markers for access levels
struct ReadOnly;
struct ReadWrite;

struct Database<Access> {
    connection_string: String,
    _marker: PhantomData<Access>,
}

impl<Access> Database<Access> {
    fn query(&self, query: &str) -> Vec<String> {
        // Common query logic
        vec![format!("Result of {}", query)]
    }
}

impl Database<ReadWrite> {
    fn execute(&self, command: &str) -> Result<(), String> {
        // Only available in read-write mode
        Ok(())
    }
}

// Usage
let read_only_db = Database::<ReadOnly> {
    connection_string: "sql://readonly".to_string(),
    _marker: PhantomData,
};

let read_write_db = Database::<ReadWrite> {
    connection_string: "sql://admin".to_string(),
    _marker: PhantomData,
};

read_only_db.query("SELECT * FROM users");
// read_only_db.execute("DROP TABLE users"); // Won't compile!
read_write_db.execute("INSERT INTO users VALUES (...)"); // Works
```

### Type-Level State Machines with ZSTs | 利用 ZST 的类型状态机

ZSTs excel at encoding state machines where state transitions happen at compile time:

ZST 擅长描述状态, 状态转换发生在编译时:

```rust
// States
struct Draft;
struct Published;
struct Archived;

// Post with type-level state
struct Post<State> {
    content: String,
    _state: PhantomData<State>,
}

// Operations available on Draft posts
impl Post<Draft> {
    fn new(content: String) -> Self {
        Post {
            content,
            _state: PhantomData,
        }
    }

    fn edit(&mut self, content: String) {
        self.content = content;
    }

    fn publish(self) -> Post<Published> {
        Post {
            content: self.content,
            _state: PhantomData,
        }
    }
}

// Operations available on Published posts
impl Post<Published> {
    fn get_views(&self) -> u64 {
        42 // Placeholder
    }

    fn archive(self) -> Post<Archived> {
        Post {
            content: self.content,
            _state: PhantomData,
        }
    }
}

// Operations available on Archived posts
impl Post<Archived> {
    fn restore(self) -> Post<Draft> {
        Post {
            content: self.content,
            _state: PhantomData,
        }
    }
}
```

### Type-Level Integers and Dimensional Analysis | 类型级整数和维度分析

With `const` generics, we can use ZSTs to encode types with numeric properties:

借助 `const` 泛型, 我们可以使用 ZST 对具有数字属性的类型进行编码:

```rust
// Type-level integers with const generics
struct Length<const METERS: i32, const CENTIMETERS: i32>;

// Type-level representation of physical quantities
impl<const M: i32, const CM: i32> Length<M, CM> {
    // A const function to calculate total centimeters (for demonstration)
    const fn total_cm() -> i32 {
        M * 100 + CM
    }
}

// Type-safe addition using type conversion rather than type-level arithmetic
fn add<const M1: i32, const CM1: i32, const M2: i32, const CM2: i32>(
    _: Length<M1, CM1>,
    _: Length<M2, CM2>,
) -> Length<3, 120> {
    // Using fixed return type for the example
    // In a real implementation, we would define constant expressions and
    // use const generics with a more flexible type, but that gets complex
    Length
}

// Usage
let a = Length::<1, 50> {};
let b = Length::<2, 70> {};
let c = add(a, b); // Type is Length<3, 120>
```

### Optimizations with ZSTs | 使用 ZST 进行优化

Because ZSTs take no space, the compiler can optimize away operations with them while preserving their type-level semantics:

由于 ZST 不占用空间, 因此编译器可以在保留其类型级语义的同时优化掉它们:

- Collections of ZSTs take no space

  ZST 集合不占用空间

- Functions returning ZSTs are optimized to simple jumps

  返回 ZST 的函数优化为简单跳转

- Fields of type ZST don’t increase struct size

  ZST 类型的字段不会增加结构体大小

This makes ZSTs perfect for:

这使得 ZST 非常适合:

- Type-level programming

  类型级编程

- Differentiating between identical data layouts with different semantics

  区分具有不同语义的相同数据布局

- Building extensible APIs with marker traits

  构建具有标记特征的可扩展 API

## Type Erasure Patterns | 类型擦除模式

Type erasure is a powerful technique for hiding concrete types behind abstract interfaces while maintaining type safety. In Rust, there are several ways to implement type erasure, each with different trade-offs.

类型擦除是一种强大的技术, 用于在保持类型安全的同时将具体类型隐藏在抽象接口后面. 在 Rust 中, 有几种方法可以实现类型擦除, 每种方法都有不同的权衡.

### Understanding Type Erasure | 了解类型擦除

Type erasure refers to the process of "erasing" or hiding concrete type information while preserving the necessary behavior. This allows for:

类型擦除是指在保留必要行为的同时 "擦除" 或隐藏具体类型信息的过程.这允许:

- Handling multiple types uniformly

  统一处理多种类型

- Creating heterogeneous collections

  创建异构集合

- Simplifying complex generic interfaces

  简化复杂的通用接口

- Providing abstraction boundaries in APIs

  在 API 中提供抽象边界

### Dynamic Trait Objects | 动态特征对象

The most common form of type erasure in Rust uses trait objects with dynamic dispatch:

Rust 中最常见的类型擦除形式是使用带有动态分派的 trait 对象:

```rust
trait Drawable {
    fn draw(&self);
    fn bounding_box(&self) -> BoundingBox;
}

struct BoundingBox {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

struct Rectangle {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

impl Drawable for Rectangle {
    fn draw(&self) {
        // Draw the rectangle
    }

    fn bounding_box(&self) -> BoundingBox {
        BoundingBox {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

struct Circle {
    x: f32,
    y: f32,
    radius: f32,
}

impl Drawable for Circle {
    fn draw(&self) {
        // Draw the circle
    }

    fn bounding_box(&self) -> BoundingBox {
        BoundingBox {
            x: self.x - self.radius,
            y: self.y - self.radius,
            width: self.radius * 2.0,
            height: self.radius * 2.0,
        }
    }
}
```

Now we can create a Canvas that can hold different types of `Drawable` objects:

现在我们可以创建一个可以容纳不同类型 `Drawable` 对象的 Canvas:

```rust
struct Canvas {
    // A collection of drawable objects with different concrete types
    elements: Vec<Box<dyn Drawable>>,
}

impl Canvas {
    fn new() -> Self {
        Canvas {
            elements: Vec::new(),
        }
    }

    fn add_element<T: Drawable + 'static>(&mut self, element: T) {
        self.elements.push(Box::new(element));
    }

    fn draw_all(&self) {
        for element in &self.elements {
            element.draw();
        }
    }
}
```

This approach uses runtime polymorphism (vtables) to call the correct implementation. The concrete type is erased, but at the cost of dynamic dispatch and heap allocation.

此方法使用运行时多态性 (虚表, vtables) 来调用正确的实现. 具体类型被擦除, 但代价是动态调度和堆分配.

### The Object-Safe Trait Pattern | 对象安全 trait 模式

Creating object-safe traits requires careful design:

创建对象安全的 trait 需要仔细设计:

> [!IMPORTANT]
>
> "对象安全" 的说法不够严谨, 现已改称 ["`dyn` 兼容性" (`dyn` compatibility)](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility)
>
> 规则简述如下:
>
> - 父 trait 是 `dyn` 兼容的.
> - 不能有 `Sized` 的约束, 包括其关联函数.
> - 不能有关联常数, 关联类型不能带泛型参数.
> - 关联函数相关要求
>   - 不能带泛型参数.
>   - 接受器类型只能是 `&Self` (即 `&self`), `&mut Self` (即 `&mut self`), `Box<Self>`, `Rc<Self>`, `Arc<Self>` 以及 `Pin<P>`, P 是前述类型之一.
>   - 除接收器外, 不使用 `Self` 作为参数.
>   - 返回类型不能为不透明类型 (opaque type), 如: 不支持 RPIT (自然不支持 `async`, AFIT).
>   - 对于不支持动态分发的方法, 可以显式添加 `Self: Sized` 约束以排除之.

```rust
// Non-object-safe trait with generic methods
trait NonObjectSafe {
    fn process<T>(&self, value: T);
}

// Object-safe wrapper
trait ObjectSafe {
    fn process_i32(&self, value: i32);
    fn process_string(&self, value: String);
    // Add concrete methods for each type you need
}

fn _assert_dyn_capable(_x: Box<dyn ObjectSafe>) {}

// Bridge implementation
impl<T: NonObjectSafe> ObjectSafe for T {
    fn process_i32(&self, value: i32) {
        self.process(value);
    }

    fn process_string(&self, value: String) {
        self.process(value);
    }
}
```

This pattern allows you to create trait objects from traits that would otherwise not be object-safe, at the cost of some flexibility.

这种模式允许您从原本不是对象安全的 trait 创建 trait 对象, 但代价是丧失一定的灵活性.

### Building Heterogeneous Collections | 构建异构集合

Type erasure is particularly useful for creating collections of different types:

类型擦除对于创建不同类型的集合特别有用:

```rust
trait Message {
    fn process(&self);
}

// Type-erased message holder
struct AnyMessage {
    inner: Box<dyn Message>,
}

// Specific message types
struct TextMessage(String);
struct BinaryMessage(Vec<u8>);

impl Message for TextMessage {
    fn process(&self) {
        println!("Processing text: {}", self.0);
    }
}

impl Message for BinaryMessage {
    fn process(&self) {
        println!("Processing binary data of size: {}", self.0.len());
    }
}

// Usage
fn main() {
    let messages: Vec<AnyMessage> = vec![
        AnyMessage { inner: Box::new(TextMessage("Hello".to_string())) },
        AnyMessage { inner: Box::new(BinaryMessage(vec![1, 2, 3, 4])) },
    ];

    for msg in messages {
        msg.inner.process();
    }
}
```

For performance-critical code, you might use an enum-based approach instead:

对于性能要求高的代码, 您可以改用基于枚举的方法:

```rust
enum MessageKind {
    Text(String),
    Binary(Vec<u8>),
}

impl MessageKind {
    fn process(&self) {
        match self {
            MessageKind::Text(text) => {
                println!("Processing text: {}", text);
            }
            MessageKind::Binary(data) => {
                println!("Processing binary data of size: {}", data.len());
            }
        }
    }
}
```

This approach avoids the dynamic dispatch overhead but requires enumerating all possible types upfront.

这种方法避免了动态调度开销, 但需要预先枚举所有可能的类型.

## Conclusion | 结论

We’ve journeyed deep into Rust’s type system, exploring powerful Rust features. Let’s recap what we’ve discovered:

我们深入研究了 Rust 的类型系统, 探索了强大的 Rust 功能.让我们回顾一下我们的发现:

- [Generic Associated Types (GATs)](#generic-associated-types-gats--泛型关联类型) — The feature years in the making that lets you create associated types that depend on lifetimes, enabling entirely new categories of safe APIs.

  泛型关联类型: 历经多年开发的功能可让您创建依赖于生命周期的关联类型, 从而启用全新的安全 API 类别.

- [Advanced Lifetime Management](#advanced-lifetime-management--高级生命周期管理) — Techniques like higher-rank trait bounds and lifetime variance that give you fine-grained control over how references relate to each other.

  高级生命周期管理: HRTB 和生命周期型变等技术, 可让您精细控制引用之间的相互关系.

- [Phantom Types](#phantom-types--虚类型) — "Ghost" type parameters that take no space at runtime but create powerful type distinctions, perfect for encoding state machines and validation requirements.

  虚类型: 像鬼魂一样的参数, 在运行时不占用空间, 但可以创建强大的类型区分, 非常适合对状态机和验证要求进行编码.

- [Typeclass Patterns](#the-typeclass-pattern--类型类模式) — Functional programming techniques brought to Rust, enabling highly generic code that works across different types through trait abstraction.

  类型类模式: 引入 Rust 的函数式编程技术, 通过特征抽象实现跨不同类型工作的高度通用代码.

- [Zero-Sized Types (ZSTs)](#zero-sized-types-zsts--零大小类型) — Types that exist only at compile time but provide powerful guarantees with zero runtime cost, from marker traits to dimensional analysis.

  零大小类型: 仅在编译时存在, 以零运行时成本提供强大保证的类型, 从标记 trait 到维度分析.

- [Type Erasure Techniques](#type-erasure-patterns--类型擦除模式) — Methods to hide implementation details while preserving behavior, essential for creating clean API boundaries and heterogeneous collections.

  类型擦除技术: 在保留行为的同时隐藏实现细节的方法, 这对于创建干净的 API 边界和异构集合至关重要.

So what should you do with this knowledge?

那么你应该如何利用这些知识呢?

The next time you find yourself writing:

下次你发现自己在写这些代码时:

- Runtime checks that could be compile-time guarantees

  可以转换为编译时保证的运行时检查

- Documentation about how API functions must be called in a certain order

  有关如何必须按特定顺序调用 API 函数的文档

- Warning comments about not mixing up similar-looking values

  关于不要混淆外观相似的值的警告注释

- Complex validation logic scattered throughout your codebase

  分散在整个代码库中的复杂验证逻辑

…consider whether one of these type system features could solve your problem more elegantly.

…考虑一下这些类型系统功能之一是否可以更优雅地解决您的问题.

The beauty of Rust’s type system is that it turns the compiler into your ally. Instead of fighting with it, you can teach it to catch your domain-specific errors before your code even runs.

Rust 类型系统的美妙之处在于它将编译器变成了你的盟友. 您可以教它在代码运行之前捕获特定于域的错误, 而不是与它斗争.
