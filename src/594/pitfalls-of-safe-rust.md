<!-- ---
author: Matthias Endler, translated by Hantong Chen
pubDatetime: 2025-04-13T23:00:00.000+08:00
# modDatetime:
title: 安全 Rust "不安全"
featured: true
draft: false
tags:
  - rust
  - translation
  - twir
description: 当人们说 Rust 是一种 "安全的语言" 时, 他们通常指的是内存安全. 虽然内存安全是一个良好的开端, 但它远非构建健壮的应用程序所需的全部. 在本文中, 我想向你展示一些编译器无法检测到的安全 Rust 中的常见问题, 以及如何避免它们.
--- -->

> `This Week in Rust (TWiR)` Rust 语言周刊中文翻译计划, 第 594 期
>
> 本文翻译自 Matthias Endler 的博客文章 [https://corrode.dev/blog/pitfalls-of-safe-rust/](https://corrode.dev/blog/pitfalls-of-safe-rust/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 4 月 13 日晚, 于北京.

# Pitfalls of Safe Rust | 安全 Rust "不安全"

When people say Rust is a "safe language", they often mean memory safety.
And while memory safety is a great start, it’s far from all it takes to build robust applications.

当人们说 Rust 是一种 "安全的语言" 时, 他们通常指的是内存安全.
虽然内存安全是一个良好的开端, 但它远非构建健壮的应用程序所需的全部.

Memory safety is important but not sufficient for overall reliability.

内存安全很重要, 但不足以支撑起整体意义上的可靠性.

In this article, I want to show you a few common gotchas in safe Rust that the compiler doesn’t detect and how to avoid them.

在本文中, 我想向你展示一些编译器无法检测到的安全 Rust 中的常见问题, 以及如何避免它们.

## Why Rust Can’t Always Help | 为什么 Rust 不是万金油

Even in safe Rust code, you still need to handle various risks and edge cases. You need to address aspects like input validation and making sure that your business logic is correct.

即使在安全的 Rust 代码中, 您仍然需要处理各种风险和现实问题. 您需要解决输入验证和确保业务逻辑正确等方面的问题.

Here are just a few categories of bugs that Rust doesn’t protect you from:

以下是 Rust 无法保护您免受的几类错误: 

- Type casting mistakes (e.g. overflows)

  类型转换错误(例如溢出)

- Logic bugs

  逻辑错误

- Panics because of using `unwrap` or `expect`

  由于使用 `unwrap` 或 `expect` 而出现 panic

- Malicious or incorrect `build.rs` scripts in third-party crates

  第三方 crate 中存在恶意或不正确的 `build.rs` 脚本

- Incorrect unsafe code in third-party libraries

  第三方库中的不安全代码不正确

- Race conditions

  竞态条件

Let’s look at ways to avoid some of the more common problems. The tips are roughly ordered by how likely you are to encounter them.

让我们看看避免一些常见问题的方法, 大致按您遇到它们的可能性排序.

### Protect Against Integer Overflow | 防止整数溢出

Overflow errors can happen pretty easily:

溢出错误很容易发生:

```rust,should_panic
// DON'T: Use unchecked arithmetic
fn calculate_total(price: u32, quantity: u32) -> u32 {
    price * quantity  // Could overflow!
}

// For DEBUG build, it will panic here
# fn main() {
calculate_total(u32::MAX, 2233);
# }
```

If `price` and `quantity` are large enough, the result will overflow. Rust will panic in debug mode, but in release mode, it will silently wrap around.

如果 `price` 和 `quantity` 足够大, 则结果将溢出. Rust 在 Debug 模式下会 panic, 但在 Release 模式下, 它会静默地回绕 (wrap, 即会采用二进制补码).

To avoid this, use checked arithmetic operations:

为避免这种情况, 请使用标准库中提供的 "已检查(是否溢出的)" 算术操作 (译者注: 以 `checked_` 为前缀):

```rust,should_panic
# #[derive(Debug)]
# enum ArithmeticError { Overflow }
// DO: Use checked arithmetic operations
fn calculate_total(price: u32, quantity: u32) -> Result<u32, ArithmeticError> {
    price.checked_mul(quantity)
        .ok_or(ArithmeticError::Overflow)
}

# fn main() {
calculate_total(u32::MAX, 2233)
# .expect("Here should panic, we detect");
# }
```

Static checks are not removed since they don’t affect the performance of generated code. So if the compiler is able to detect the problem at compile time, it will do so:

当然, 静态检查是始终的, 因为它们不会影响生成的代码的性能. 如果编译器能够在编译时检测到问题, 它将这样做:

```rust,compile_fail
fn main() {
    let x: u8 = 2;
    let y: u8 = 128;
    let z = x * y;  // Compile-time error!
#     let _z = z;   
}
```

The error message will be:

错误消息将是:

```stderr
error: this arithmetic operation will overflow
 --> src/main.rs:4:13
  |
4 |     let z = x * y;  // Compile-time error!
  |             ^^^^^ attempt to compute `2_u8 * 128_u8`, which would overflow
  |
  = note: `#[deny(arithmetic_overflow)]` on by default
```

For all other cases, use [`checked_add`](https://docs.rs/num/latest/num/trait.CheckedAdd.html), [`checked_sub`](https://docs.rs/num/latest/num/trait.CheckedSub.html), [`checked_mul`](https://docs.rs/num/latest/num/trait.CheckedMul.html), and [`checked_div`](https://docs.rs/num/latest/num/trait.CheckedDiv.html), which return `None` instead of wrapping around on underflow or overflow.[^1]

此类函数包括 `checked_add`、`checked_sub`、`checked_mul` 和 `checked_div`, 它们在发生溢出时返回 `None`, 而不是静默回绕.[^1]

[^1]: There’s also methods for wrapping and saturating arithmetic, which might be useful in some cases. It’s worth it to check out the [`std::intrinsics`](https://doc.rust-lang.org/std/intrinsics/index.html) documentation to learn more.<br>
此外, 还有用于有目的地回绕 (wrap, 即发生溢出时结果从另一端重新开始计算) 或**截断至边界** (saturate, 即溢出时结果取边界值) 的算术方法, 在某些情况下可能很有用. 查阅 [`std::intrinsics`](https://doc.rust-lang.org/std/intrinsics/index.html) 文档以了解更多信息.

> [!TIP]
> Enable Overflow Checks In Release Mode
>
> 在 Release 模式下启用溢出检查
>
> Rust carefully balances performance and safety. In scenarios where a performance hit is acceptable, memory safety takes precedence.
>
> Rust 小心翼翼地平衡了性能和安全性. 在性能影响可以接受的情况下, 内存安全优先.
>
> Integer overflows can lead to unexpected results, but they are not inherently unsafe. On top of that, overflow checks can be expensive, which is why Rust disables them in release mode.
>
> 整数溢出可能会导致意外结果, 但它们本身并非不安全. 最重要的是, 溢出检查可能性能代价高昂, 这就是 Rust 在发布模式下禁用它们的原因.
>
> However, you can re-enable them in case your application can trade the last 1% of performance for better overflow detection.
>
> 但是, 您可以重新启用它们, 让您的应用程序付出牺牲最后 1% 的性能为代价来获得更好的溢出检测.
>
> Put this into your Cargo.toml:
>
> 将它放入你的 Cargo.toml 中:
>
> ```toml
> [profile.release]
> overflow-checks = true # Enable integer overflow checks in release mode
> ```
>
> This will enable overflow checks in release mode. As a consequence, the code will panic if an overflow occurs.
>
> 这将在 Release 模式下启用溢出检查. 因此, 如果发生溢出, 代码将 panic (译者注: 这不还是导致运行时 panic, 所以还是尽量用 `checked_` 操作).
>
> See [the docs](https://doc.rust-lang.org/cargo/reference/profiles.html#release) for more details.
> 有关更多详细信息, 请参阅[文档](https://doc.rust-lang.org/cargo/reference/profiles.html#release). 
>
> ---
>
> One example where Rust accepts a performance cost for safety would be `checked` array indexing, which prevents buffer overflows at runtime. Another is when the Rust maintainers [fixed float casting](https://internals.rust-lang.org/t/help-us-benchmark-saturating-float-casts/6231) because the previous implementation could cause undefined behavior when casting certain floating point values to integers.
>
> Rust 为了安全而接受性能成本的一个例子是 `checked` 数组索引, 它可以防止运行时的缓冲区溢出. 另一个是当 Rust 维护者[修复浮点转换](https://internals.rust-lang.org/t/help-us-benchmark-saturating-float-casts/6231)时, 因为以前的实现在将某些浮点值转换为整数时可能会导致未定义的行为.
>
> ---
>
> According to some benchmarks, overflow checks cost a few percent of performance on typical integer-heavy workloads. See Dan Luu’s analysis [here](https://danluu.com/integer-overflow/).
>
> 根据一些基准测试, 溢出检查在典型的整数密集型工作负载上消耗的性能只有百分之几. 在[此处](https://danluu.com/integer-overflow/)查看 Dan Luu 的分析.

### Avoid `as` For Numeric Conversions | 避免 `as` 转换数字类型

While we’re on the topic of integer arithmetic, let’s talk about type conversions. Casting values with `as` is convenient but risky unless you know exactly what you are doing.

当我们讨论整数运算的话题时, 让我们谈谈类型转换.
使用 `as` 强制转换值很方便, 但存在风险, 除非你确切知道自己在做什么.

```rust
# fn main() {
let x: i32 = 42;
let y: i8 = x as i8;  // Can overflow!
# }
```

There are three main ways to convert between numeric types in Rust:

在 Rust 中, 主要有三种方法可以在数字类型之间进行转换:

- ⚠️ Using the `as` keyword: This approach works for both lossless and lossy conversions. In cases where data loss might occur (like converting from `i64` to `i32`), it will simply truncate the value.

  ⚠️ 使用 `as` 关键字: 此方法可用于无损和有损转换. 在可能发生数据丢失的情况下(例如从 `i64` 转换为 `i32`), 它只会截断. 

- Using [`From::from()`](https://doc.rust-lang.org/std/convert/trait.From.html): This method only allows lossless conversions. For example, you can convert from i32 to i64 since all 32-bit integers can fit within 64 bits. However, you cannot convert from i64 to i32 using this method since it could potentially lose data.

  使用 [`From::from()`](https://doc.rust-lang.org/std/convert/trait.From.html): 此方法只允许无损转换.
  例如, 您可以从 `i32` 转换为 `i64`, 因为所有 32 位整数都可以容纳在 64 位内.
  但是, 您不能使用此方法从 `i64` 转换为 `i32`, 因为它可能会丢失数据.

- Using [`TryFrom`](https://doc.rust-lang.org/std/convert/trait.TryFrom.html): This method is similar to `From::from()` but returns a `Result` instead of panicking. This is useful when you want to handle potential data loss gracefully.

  使用 [`TryFrom`](https://doc.rust-lang.org/std/convert/trait.TryFrom.html): 此方法类似于 `From::from()`, 但返回 `Result` 而不是 panic. 当您想要正常处理潜在的数据丢失时, 这非常有用.

> [!TIP]
> Safe Numeric Conversions
>
> 安全的数值转换
>
> If in doubt, prefer `From::from()` and `TryFrom` over `as`.
>
> 如有选择困难症, 请首选 `From::from()` 或 `TryFrom` 而不是 `as`.
>
> - use `From::from()` when you can guarantee no data loss.
>
>   当您可以保证不会丢失数据时, 请使用 `From::from()`.
>
>   译者注:
>   一定意义上这是取悦类型系统的做法, 例如 `i32` 向 `i64` 转换是必然无损的, 才允许 `From::from()`, 直接 `as` 即可.
>   这个方法一个更突出的意义在于处理 `i64` 向 `isize` 这种涉及  `isize`, `usize` 的转换, 因为在 32 位系统 `isize` 等价于 `i32` 而不是 `i64`, 以此类推.
>
> - use `TryFrom` when you need to handle potential data loss gracefully.
> 
>   当您需要正常处理潜在的数据丢失时, 请使用 `TryFrom`.
>
> - only use `as` when you’re comfortable with potential truncation or know the values will fit within the target type’s range and when performance is absolutely critical.
>
>   仅当你不在意可能的截断或知道值一定处于目标数字类型的可容纳范围并且性能绝对关键时, 才使用 `as`. 
>
> (Adapted from [StackOverflow answer by delnan](https://stackoverflow.com/a/28280042/270334) and [additional context](https://stackoverflow.com/a/48795524/270334).)
>
> (改编自 [delnan 的 StackOverflow 回复](https://stackoverflow.com/a/28280042/270334)和[其他上下文内容](https://stackoverflow.com/a/48795524/270334).)

The as operator is not safe for narrowing conversions. It will silently truncate the value, leading to unexpected results.

as 运算符对于缩小转换范围是不安全的. 它将静默截断值, 从而导致意外的结果. 

What is a narrowing conversion? It’s when you convert a larger type to a smaller type, e.g. i32 to i8.

什么是收缩转换? 当你将一个(可容纳数字范围)较大的类型转换为一个较小的类型时, 例如 `i32` 到 `i8`.

For example, see how as chops off the high bits from our value:

例如, 看看 `as` 如何从我们的值中切掉高位: 

```rust
fn main() {
    let a: u16 = 0x1234;
    let b: u8 = a as u8;
    println!("0x{:04x}, 0x{:02x}", a, b); // 0x1234, 0x34
}
```

So, coming back to our first example above, instead of writing

所以, 回到上面的第一个例子, 不要这么写

```rust,no_run
let x: i32 = 42;
let y: i8 = x as i8;  // Can overflow!
```

use `TryFrom` instead and handle the error gracefully:

请改用 `TryFrom` 并优雅地处理可能的转换错误:

```rust,no_run
let y = i8::try_from(x).ok_or("Number is too big to be used here")?;
```

(译者注: 推荐查阅 [https://cheats.han.rs/#type-conversions](https://cheats.han.rs/#type-conversions) 快速查阅有关 `as` 关键字的用法说明.)

### Use Bounded Types for Numeric Values | 对数值使用有界类型

Bounded types make it easier to express invariants and avoid invalid states.

有界类型可以更轻松地表达不变量并避免无效状态.

E.g. if you have a numeric type and 0 is never a correct value, use [`std::num::NonZeroUsize`](https://doc.rust-lang.org/std/num/type.NonZeroUsize.html) instead.

例如, 如果你有一个数字类型, 并且 0 永远不是正确的值, 请改用 [`std::num::NonZeroUsize`](https://doc.rust-lang.org/std/num/type.NonZeroUsize.html).

You can also create your own bounded types:

您还可以创建自己的有界类型, 这里是一个完整示例:

```rust
// This example demonstrates how to use bounded types to enforce invariants
// Instead of using raw primitive types that could have invalid values,
// we create a custom type that enforces constraints on construction

// 此示例展示了如何利用有界类型来强制保持不变量的有效性.
// 相较于使用可能包含无效值的原始基本类型, 
// 我们创建了一个自定义类型, 在构造时强制检查约束条件.

// Define our error type
// 定义错误类型
// (译者注: 这种只有一种可能变体的类型不如使用 marker Struct 模式, ZST 会被优化掉)
#[derive(Debug)]
enum DistanceError {
    Invalid,
}

// DON'T: Use raw numeric types for domain values
// 不要为内部数据使用原始的数字类型
struct RawMeasurement {
    distance: f64, // Could be negative or NaN! 可能是负数或 NaN!
}

// DO: Create bounded types with well-defined constraints
/// A distance value that is guaranteed to be non-negative and finite
///
/// This type provides several advantages:
/// - It's impossible to create an invalid distance (negative or NaN)
/// - The validation happens once at creation time
/// - Functions accepting this type don't need to re-validate
/// - Intent is clearly documented in the type system
///
// 务必: 创建具有明确约束定义的边界类型
/// 保证为非负且有限的距离值
///
/// 该类型具有以下优势:
/// - 无法创建无效距离 (负数或NaN)
/// - 验证仅在创建时进行一次
/// - 接受此类型的函数无需重复验证
/// - 意图通过类型系统清晰记录
#[derive(Debug, Clone, Copy, PartialEq)]
struct Distance(f64);

impl Distance {
    /// Creates a new Distance if the value is valid (non-negative and finite)
    ///
    /// # Errors
    ///
    /// Returns `DistanceError::Invalid` if:
    ///
    /// - The value is negative
    /// - The value is NaN or infinity
    ///
    /// 当数值有效 (非负且有限) 时创建一个新的 Distance
    ///
    /// # 错误
    ///
    /// 以下情况返回 `DistanceError::Invalid`:
    ///
    /// - 数值为负数
    /// - 数值为NaN或无限大
    pub fn new(value: f64) -> Result<Self, DistanceError> {
        if value < 0.0 || !value.is_finite() {
            return Err(DistanceError::Invalid);
        }
        Ok(Distance(value))
    }

    /// Returns the underlying distance value
    pub fn value(&self) -> f64 {
        self.0
    }
}

/// A measurement with guaranteed valid distance
#[derive(Debug, Clone, Copy, PartialEq)]
struct Measurement {
    distance: Distance,
}

impl Measurement {
    /// Creates a new measurement with the given distance
    ///
    /// # Errors
    ///
    /// Returns `DistanceError::Invalid` if the distance is invalid
    pub fn new(distance: f64) -> Result<Self, DistanceError> {
        let distance = Distance::new(distance)?;
        Ok(Measurement { distance })
    }
}

fn main() -> Result<(), DistanceError> {
    // Valid distance
    let valid_measurement = Measurement::new(42.0)?;
    println!("Valid measurement: {:?}", valid_measurement.distance);

    // These would fail at creation time, preventing invalid states:

    // Negative distance
    let negative_result = Measurement::new(-5.0);
    println!("Negative distance result: {:?}", negative_result);

    // NaN distance
    let nan_result = Measurement::new(f64::NAN);
    println!("NaN distance result: {:?}", nan_result);

    // Infinite distance
    let inf_result = Measurement::new(f64::INFINITY);
    println!("Infinite distance result: {:?}", inf_result);

    Ok(())
}
```

### Don’t Index Into Arrays Without Bounds Checking | 不要在没有边界检查的情况下索引数组

Whenever I see the following, I get goosebumps😨:

每当我看到以下内容时, 我都会起鸡皮疙瘩😨:

```rust,should_panic
# fn main() {
let arr = [1, 2, 3];
let elem = arr[3];  // Panic!
# let _elem = elem;
# }
```

That’s a common source of bugs. Unlike C, Rust does check array bounds and prevents a security vulnerability, but it still panics at runtime.

这是 bug 的常见来源. 与 C 语言不同, Rust 确实会检查数组边界, 但不影响它还是会导致运行时 panic.

Instead, use the `get` method:

请改用 `get` 方法:

```rust,no_run
let elem = arr.get(3);
```

It returns an `Option` which you can now handle gracefully.

它返回一个 `Option`, 您现在可以优雅地处理它.

See [this blog post](https://shnatsel.medium.com/how-to-avoid-bounds-checks-in-rust-without-unsafe-f65e618b4c1e) for more info on the topic.

请参阅[此博客文章](https://shnatsel.medium.com/how-to-avoid-bounds-checks-in-rust-without-unsafe-f65e618b4c1e)获得更多信息.

### Use `split_at_checked` Instead Of `split_at` | 使用 `split_at_checked` 而不是 `split_at`

This issue is related to the previous one. Say you have a slice and you want to split it at a certain index.

此问题与上一个有关. 假设你有一个切片, 你想在某个索引处拆分它:

```rust,should_panic
# fn main() {
let mid = 4;
let arr = [1, 2, 3];
let (left, right) = arr.split_at(mid);
# let _ = (left, right);
# }
```

You might expect that this returns a tuple of slices where the first slice contains all elements and the second slice is empty.

您可能只是觉得这会返回一个切片元组, 其中第一个切片包含所有元素, 而第二个切片为空.

Instead, the above code will panic because the `mid` index is out of bounds!
相反, 上面的代码会 panic, 因为 `mid` 索引超出范围!

To handle that more gracefully, use `split_at_checked` instead:

要更优雅地处理这个问题, 请改用 `split_at_checked`:

```rust
# fn main() {
# let mid = 4;
let arr = [1, 2, 3];
// This returns an Option
match arr.split_at_checked(mid) {
    Some((left, right)) => {
        // Do something with left and right
#        let _ = (left, right);
    }
    None => {
        // Handle the error
    }
}
# }
```

This returns an `Option` which allows you to handle the error case.

这将返回一个 `Option`.

More info about `split_at_checked` [here](https://doc.rust-lang.org/std/primitive.slice.html#method.split_at_checked).

有关 `split_at_checked` 的更多信息, 请点击[此处](https://doc.rust-lang.org/std/primitive.slice.html#method.split_at_checked).

### Avoid Primitive Types For Business Logic | 避免在业务逻辑中直接使用基本类型

It’s very tempting to use primitive types for everything. Especially Rust beginners fall into this trap.

对所有事情都使用原始类型是非常直接的, 尤其是 Rust 初学者会落入这个陷阱.

```rust,no_run
// DON'T: Use primitive types for usernames
// 不要为用户名使用基本类型!
fn authenticate_user(username: String) {
    // Raw String could be anything - empty, too long, or contain invalid characters
    // 可以是任何字符串: 空的, 过长的, 或者含非法字符的
}
```

However, do you really accept any string as a valid username? What if it’s empty? What if it contains emojis or special characters?

但是, 您真的接受任何字符串作为有效的用户名吗? 如果它是空的怎么办? 如果它包含表情符号或特殊字符怎么办?

You can create a custom type for your domain instead:

您可以改为创建自定义类型, 下面是一个完整示例:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Username(String);

enum UsernameError {
    Empty,
    TooLong,
    InvalidCharacters,
}

impl Username {
    pub fn new(name: &str) -> Result<Self, UsernameError> {
        // Check for empty username
        // 非空
        if name.is_empty() {
            return Err(UsernameError::Empty);
        }

        // Check length (for example, max 30 characters)
        // 限制长度
        if name.len() > 30 {
            return Err(UsernameError::TooLong);
        }

        // Only allow alphanumeric characters and underscores
        // 限制可用的字符
        // 这里还有个坑是, 不要试图手动 `as_bytes` 再逐个字节 as char, 注意底层是 UTF-8 编码的!
        // 请使用 `chars()` 创建对字符的迭代器 (iterator), 它会帮我们处理编码问题.
        if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err(UsernameError::InvalidCharacters);
        }

        Ok(Username(name.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn authenticate_user(username: Username) {
    // We know this is always a valid username!
    // No empty strings, no emojis, no spaces, etc.
}
```

### Make Invalid States Unrepresentable | 使无效状态不可表示

The next point is closely related to the previous one.

下一点与上一点密切相关.

Can you spot the bug in the following code?

您能发现以下代码中的错误吗?

```rust,no_run
// DON'T: Allow invalid combinations
struct Configuration {
    port: u16,
    host: String,
    ssl: bool,
    ssl_cert: Option<String>, 
}
```

The problem is that you can have `ssl` set to `true` but `ssl_cert` set to None. That’s an invalid state! If you try to use the SSL connection, you can’t because there’s no certificate. This issue can be detected at compile-time:

问题是你可以将 `ssl` 设置为 true, 但将 ssl_cert 设置为 None. 这是一个无效的状态! 如果您尝试使用 SSL 连接, 则无法使用, 因为没有证书. 实际上, 可以在编译时检测到此问题:

Use types to enforce valid states:

使用类型系统强制保证有效状态:

```rust,no_run
// First, let's define the possible states for the connection
// 首先让我们确认连接的所有可能状态
enum ConnectionSecurity {
    Insecure,
    // We can't have an SSL connection
    // without a certificate!
    // 没有证书没办法建立 SSL 链接!
    Ssl { cert_path: String },
}

struct Configuration {
    port: u16,
    host: String,
    // Now we can't have an invalid state!
    // Either we have an SSL connection with a certificate
    // or we don't have SSL at all.
    // 现在, 我们就没办法遇到非法状态了!
    // 要么有证书能建立 SSL 连接, 要不然就是不能建立 SSL 连接!
    security: ConnectionSecurity,
}
```

In comparison to the previous section, the bug was caused by an invalid combination of closely related fields. To prevent that, clearly map out all possible states and transitions between them. A simple way is to define an enum with optional metadata for each state.

与上一节相比, 该 bug 是由密切相关的字段的无效组合引起的. 为了防止这种情况, 请清楚地规划出所有可能的状态和它们之间的转换. 一种简单的方法是定义一个枚举, 为每个状态指定一个变体, 并附加可能需要的字段.

If you’re curious to learn more, here is a more in-depth [blog post on the topic](https://corrode.dev/blog/illegal-state/).

如果您想了解更多信息, 这里有一篇关于该主题的更深入的[博客文章](https://corrode.dev/blog/illegal-state/).

(译者注: 等待翻译!)

### Handle Default Values Carefully | 谨慎处理默认值

It’s quite common to add a blanket `Default` implementation to your types. But that can lead to unforeseen issues.

向你的类型添加一个空白的 `Default` 实现是很常见的. 但这可能会导致不可预见的问题.

For example, here’s a case where the port is set to 0 by default, which is not a valid port number.[^2]

例如, 在这种情况下, 端口默认设置为 0, 这不是一个有效的端口号.[^2].

[^2]: Port 0 usually means that the OS will assign a random port for you. So, `TcpListener::bind("127.0.0.1:0").unwrap()` is valid, but it might not be supported on all operating systems or it might not be what you expect. See the [`TcpListener::bind`](https://doc.rust-lang.org/std/net/struct.TcpListener.html#method.bind) docs for more info.<br>
端口 0 通常意味着作系统将为您分配一个随机端口。因此, `TcpListener::bind("127.0.0.1:0").unwrap()` 是有效的, 但可能并非在所有系统上都支持它, 或者它可能不是您所期望的. 有关更多信息, 请参阅 [`TcpListener::bind`](https://doc.rust-lang.org/std/net/struct.TcpListener.html#method.bind) 的文档.

```rust,no_run
// DON'T: Implement `Default` without consideration
#[derive(Default)]  // Might create invalid states!
struct ServerConfig {
    port: u16,      // Will be 0, which isn't a valid port!
    max_connections: usize,
    timeout_seconds: u64,
}
```

Instead, consider if a default value makes sense for your type.

请考虑默认值是否对您的类型有意义.

```rust
# use std::{num::{NonZeroUsize, NonZeroU16}, time::Duration};
#
# #[derive(Debug, Clone, Copy, PartialEq, Eq)]
# struct Port(NonZeroU16);
#
// DO: Make Default meaningful or don't implement it
struct ServerConfig {
    port: Port,
    max_connections: NonZeroUsize,
    timeout_seconds: Duration,
}

impl ServerConfig {
    pub const fn new(port: Port) -> Self {
        Self {
            port,
            max_connections: NonZeroUsize::new(100).unwrap(),
            timeout_seconds: Duration::from_secs(30),
        }
    }
}
```

### Implement `Debug` Safely | 安全地实现 `Debug`

If you blindly derive `Debug` for your types, you might expose sensitive data. Instead, implement `Debug` manually for types that contain sensitive information.

如果盲目地为您的类型派生 `Debug`, 则可能会暴露敏感数据. 请为包含敏感信息的类型手动实现 `Debug`.

```rust,no_run
// DON'T: Expose sensitive data in debug output
#[derive(Debug)]
struct User {
    username: String,
    password: String,  // Will be printed in debug output!
}
```

Instead, you could write:
相反, 您可以编写: 

```rust
// DO: Implement Debug manually
#[derive(Debug)]
struct User {
    username: String,
    password: Password,
}

struct Password(String);

impl std::fmt::Debug for Password {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

fn main() {
    let user = User {
        username: String::from(""),
        password: Password(String::from("")),
    };
    println!("{user:#?}");
}
```

This prints 此打印

```stdout
User {
    username: "",
    password: [REDACTED],
}
```

For production code, use a crate like [`secrecy`](https://crates.io/crates/secrecy).

对于生产代码, 请使用类似 [`secrecy`](https://crates.io/crates/secrecy) 这种 crate. 

However, it’s not black and white either: If you implement `Debug` manually, you might forget to update the implementation when your struct changes. A common pattern is to destructure the struct in the `Debug` implementation to catch such errors.

然而, 它也不是非黑即白的: 如果你手动实现 `Debug`, 你可能会忘记在结构体更改时更新实现. 一种常见的模式是在 `Debug` 实现中解构结构以捕获此类错误.

Instead of this:

不要这么干:

```rust,no_run
// don't
impl std::fmt::Debug for DatabaseURI {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}://{}:[REDACTED]@{}/{}", self.scheme, self.user, self.host, self.database)
    }
}
```

How about destructuring the struct to catch changes?

如何解构结构体以捕获更改?

```rust,editable
// 这里 user, password 这些都不应该直接用 String 的
// 仅作示例, 原文的链接放错了
// 尝试加个字段然后运行看看会发生什么? 把 database_version 一行解除注释吧
struct DatabaseURI {
    scheme: String,
    user: String,
    password: String,
    host: String,
    database: String,
    // database_version: u16
}
// do
impl std::fmt::Debug for DatabaseURI {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
       // Destructure the struct to catch changes
       // This way, the compiler will warn you if you add a new field
       // and forget to update the Debug implementation
       // 解构结构体以捕获变更
       // 这样当你新增字段却忘记更新 Debug 实现时
       // 编译器会发出警告
        let DatabaseURI { scheme, user, password: _, host, database, } = self;
        write!(f, "{scheme}://{user}:[REDACTED]@{host}/{database}")?;
        // -- or --
        // f.debug_struct("DatabaseURI")
        //     .field("scheme", scheme)
        //     .field("user", user)
        //     .field("password", &"***")
        //     .field("host", host)
        //     .field("database", database)
        //     .finish()

        Ok(())
    }
}
```

Thanks to [Wesley Moore (wezm)](https://www.wezm.net/) for the hint and to [Simon Brüggen (m3t0r)](https://github.com/M3t0r) for the example.

感谢 [Wesley Moore (wezm)](https://www.wezm.net/) 的提示和 [Simon Brüggen (m3t0r)](https://github.com/M3t0r) 提供示例.

(译者注: 可是放错链接了)

### Careful With Serialization | 谨慎使用序列化

Don’t blindly derive `Serialize` and `Deserialize` – especially for sensitive data. The values you read/write might not be what you expect!

不要盲目地派生 `Serialize` 和 `Deserialize`: 尤其是对于敏感数据. 您读/写的值可能不是您期望的值!

```rust,no_run
// DON'T: Blindly derive Serialize and Deserialize 
#[derive(Serialize, Deserialize)]
struct UserCredentials {
    #[serde(default)]  // ⚠️ Accepts empty strings when deserializing!
    username: String,
    #[serde(default)]
    password: String, // ⚠️ Leaks the password when serialized!
}
```

When deserializing, the fields might be empty. Empty credentials could potentially pass validation checks if not properly handled

反序列化时, 字段可能为空. 如果处理不当, 空凭证可能会通过验证检查.

On top of that, the serialization behavior could also leak sensitive data. By default, `Serialize` will include the `password` field in the serialized output, which could expose sensitive credentials in logs, API responses, or debug output.

最重要的是, 序列化行为还可能泄露敏感数据. 默认情况下, `Serialize` 将在序列化输出中包含 `password` 字段, 这可能会在日志、API 响应或调试输出中暴露敏感凭据.

A common fix is to implement your own custom serialization and deserialization methods by using `impl<'de> Deserialize<'de> for UserCredentials`.

一种常见的解决方法是使用 `impl<'de> Deserialize<'de> for UserCredentials` 实现你自己的自定义序列化和反序列化方法.

The advantage is that you have full control over input validation. However, the disadvantage is that you need to implement all the logic yourself.

优点是您可以完全控制输入验证. 但是, 缺点是您需要自己实现所有代码逻辑. 

An alternative strategy is to use the `#[serde(try_from = "FromType")]` attribute.

另一种策略是使用 (serde 等库提供的自定义解析方法的属性, 如) `#[serde(try_from = "FromType")]`. 

Let’s take the `Password` field as an example. Start by using the newtype pattern to wrap the standard types and add custom validation:

我们以 `Password` 字段为例. 首先使用新类型模式包装标准类型并添加自定义验证:

```rust,no_run
#[derive(Deserialize)]
// Tell serde to call `Password::try_from` with a `String`
#[serde(try_from = "String")]
pub struct Password(String);
```

Now implement `TryFrom` for `Password`:
现在为 `Password` 实现 `TryFrom`: 

```rust,no_run
impl TryFrom<String> for Password {
    type Error = PasswordError;

    /// Create a new password
    ///
    /// Throws an error if the password is too short.
    /// You can add more checks here.
    fn try_from(value: String) -> Result<Self, Self::Error> {
        // Validate the password
        if value.len() < 8 {
            return Err(PasswordError::TooShort);
        }
        Ok(Password(value))
    }
}
```

With this trick, you can no longer deserialize invalid passwords:

使用此技巧, 您将无法再反序列化无效密码:

```rust,no_run
// Panic: password too short!
let password: Password = serde_json::from_str(r#""pass""#).unwrap();
```

完整示例:

```rust
extern crate serde;
extern crate serde_json;

use serde::Deserialize;
use std::fmt;

#[derive(Debug)]
pub enum PasswordError {
    TooShort,
}

impl fmt::Display for PasswordError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::TooShort => write!(f, "password too short"),
        }
    }
}

impl std::error::Error for PasswordError {}

#[derive(Deserialize)]
// Tell serde to call `Password::try_from` with a `String`
#[serde(try_from = "String")]
pub struct Password(String);

impl TryFrom<String> for Password {
    type Error = PasswordError;

    /// Create a new password
    ///
    /// Throws an error if the password is too short.
    /// You can add more checks here.
    fn try_from(value: String) -> Result<Self, Self::Error> {
        // Validate the password
        if value.len() < 8 {
            return Err(PasswordError::TooShort);
        }
        Ok(Password(value))
    }
}

fn main() {
    let password: Password = serde_json::from_str(r#""pass""#).unwrap(); // Panic: password too short!
#    let _password = password.0;
}
```

Credits go to [EqualMa's article on dev.to](https://dev.to/equalma/validate-fields-and-types-in-serde-with-tryfrom-c2n) and to [Alex Burka (durka)](https://github.com/durka) for the hint.

感谢 [EqualMa 在 dev.to 上的文章](https://dev.to/equalma/validate-fields-and-types-in-serde-with-tryfrom-c2n) 和 [Alex Burka (durka)](https://github.com/durka) 的提示.

### Protect Against Time-of-Check to Time-of-Use (TOCTOU) | 防止 "检查时间与使用时间" 攻击

This is a more advanced topic, but it’s important to be aware of it. TOCTOU (time-of-check to time-of-use) is a class of software bugs caused by changes that happen between when you check a condition and when you use a resource.

这是一个更高级的主题, 但了解它很重要. TOCTOU 是一类软件错误, 这些错误是由检查条件和使用资源之间发生的变化引起的.

```rust,no_run
// DON'T: Vulnerable approach with separate check and use
fn remove_dir(path: &Path) -> io::Result<()> {
    // First check if it's a directory
    if !path.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "not a directory"
        ));
    }
    
    // TOCTOU vulnerability: Between the check above and the use below,
    // the path could be replaced with a symlink to a directory we shouldn't access!
    remove_dir_impl(path)
}
```

([Rust playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=fb208eb58e49ce70bde77a48b9b102d1))

The safer approach opens the directory first, ensuring we operate on what we checked:

更安全的方法是首先打开目录, 保证我们所操作的内容是我们先前检查过的:

```rust,no_run
// DO: Safer approach that opens first, then checks
fn remove_dir(path: &Path) -> io::Result<()> {
    // Open the directory WITHOUT following symlinks
    let handle = OpenOptions::new()
        .read(true)
        .custom_flags(O_NOFOLLOW | O_DIRECTORY) // Fails if not a directory or is a symlink
        .open(path)?;
    
    // Now we can safely remove the directory contents using the open handle
    remove_dir_impl(&handle)
}
```

([Rust playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=08a3a0a030a1878171e7eb76adb6ffb8))

Here’s why it’s safer: while we hold the `handle`, the directory can’t be replaced with a symlink. This way, the directory we’re working with is the same as the one we checked. Any attempt to replace it won’t affect us because the handle is already open.

这就是为什么它更安全: 当我们持有 `handle` 时, 目录不能被符号链接替换. 这样, 我们正在使用的目录与我们检查的目录相同. 任何更换它的尝试都不会影响我们, 因为文件句柄已经打开了.

You’d be forgiven if you overlooked this issue before. In fact, even the Rust core team missed it in the standard library. What you saw is a simplified version of an actual bug in the [`std::fs::remove_dir_all`](https://doc.rust-lang.org/std/fs/fn.remove_dir_all.html) function. Read more about it in [this blog post about CVE-2022-21658](https://blog.rust-lang.org/2022/01/20/cve-2022-21658.html).

如果您以前忽略了这个问题, 那也是情有可原的. 事实上, 即使是 Rust 核心团队也曾在标准库中忽视了这个问题. 您看到的是出现在 [`std::fs::remove_dir_all`](https://doc.rust-lang.org/std/fs/fn.remove_dir_all.html) 函数中一个实际的 bug 的简化版本. 在这篇[关于 CVE-2022-21658 的博文](https://blog.rust-lang.org/2022/01/20/cve-2022-21658.html)中阅读更多相关信息.

### Use Constant-Time Comparison for Sensitive Data | 对敏感数据使用常数时间比较

Timing attacks are a nifty way to extract information from your application. The idea is that the time it takes to compare two values can leak information about them. For example, the time it takes to compare two strings can reveal how many characters are correct. Therefore, for production code, be careful with regular equality checks when handling sensitive data like passwords.

计时攻击是从应用程序中提取信息的一种巧妙方法. 其思路是, 比较两个值所花费的时间可能会泄露有关它们的信息.
例如, 比较两个字符串所花费的时间可以揭示有多少个字符是正确的. 因此, 对于生产环境代码, 在处理密码等敏感数据时要小心, 相等性检查应当是等时的. 

```rust,no_run
// DON'T: Use regular equality for sensitive comparisons
fn verify_password(stored: &[u8], provided: &[u8]) -> bool {
    stored == provided  // Vulnerable to timing attacks!
}

// DO: Use constant-time comparison
use subtle::{ConstantTimeEq, Choice};

fn verify_password(stored: &[u8], provided: &[u8]) -> bool {
    stored.ct_eq(provided).unwrap_u8() == 1
}
```

### Don’t Accept Unbounded Input | 不接受无限度输入

Protect Against Denial-of-Service Attacks with Resource Limits. These happen when you accept unbounded input, e.g. a huge request body which might not fit into memory.

通过资源限制防止拒绝服务攻击. 当你接受无限度输入时, 就会发生这种情况, 例如, 一个巨大的请求可能无法放入内存.

```rust,no_run
// DON'T: Accept unbounded input
fn process_request(data: &[u8]) -> Result<(), Error> {
    let decoded = decode_data(data)?;  // Could be enormous!
    // Process decoded data
    Ok(())
}
```

Instead, set explicit limits for your accepted payloads:

请为请求内容设置显式限制:

```rust,no_run
const MAX_REQUEST_SIZE: usize = 1024 * 1024;  // 1MiB

fn process_request(data: &[u8]) -> Result<(), Error> {
    if data.len() > MAX_REQUEST_SIZE {
        return Err(Error::RequestTooLarge);
    }
    
    let decoded = decode_data(data)?;
    // Process decoded data
    Ok(())
}
```

### Surprising Behavior of `Path::join` With Absolute Paths | `Path::join` 处理绝对路径时的惊人行为

If you use `Path::join` to join a relative path with an absolute path, it will silently replace the relative path with the absolute path.

如果使用 `Path::join` 将相对路径与绝对路径连接起来, 则会静默地将相对路径替换为绝对路径.

```rust
use std::path::Path;

fn main() {
    let path = Path::new("/usr").join("/local/bin");
    println!("{path:?}"); // Prints "/local/bin" 
}
```

This is because `Path::join` will return the second path if it is absolute.

这是因为如果 `Path::join` 一个绝对路径, 则返回这个绝对路径.

(译者注: 这个函数不是返回一个 `Result` 毕竟, 两个绝对路径连接没有意义的嘛...)

I was not the only one who was confused by this behavior. Here’s a [thread](https://users.rust-lang.org/t/rationale-behind-replacing-paths-while-joining/104288) on the topic, which also includes an answer by Johannes Dahlström:

我不是唯一一个对这种行为感到困惑的人. 这是关于该主题的[帖子](https://users.rust-lang.org/t/rationale-behind-replacing-paths-while-joining/104288), 其中还包括 [Johannes Dahlström](https://users.rust-lang.org/u/jdahlstrom/summary) 的回答: 

> The behavior is useful because a caller […] can choose whether it wants to use a relative or absolute path, and the callee can then simply absolutize it by adding its own prefix and the absolute path is unaffected which is probably what the caller wanted. The callee doesn’t have to separately check whether the path is absolute or not.
>
> 该行为很有用, 因为调用方 [...] 可以选择是否要使用相对路径或绝对路径, 然后被调用方可以通过添加自己的前缀来简单地将其绝对路径化, 并且绝对路径不受影响, 这可能是调用方想要的. 被调用方不必单独检查路径是否为绝对路径.

And yet, I still think it’s a footgun. It’s easy to overlook this behavior when you use user-provided paths. Perhaps `join` should return a `Result` instead? In any case, be aware of this behavior.

然而, 我仍然认为这是一柄双刃剑. 当您使用用户提供的路径时, 很容易忽略此行为. 也许 `join` 应该返回 `Result`? 无论如何, 请注意此行为.

### Check For Unsafe Code In Your Dependencies With `cargo-geiger` | 使用 `cargo-geiger` 检查依赖项中的不安全代码

So far, we’ve only covered issues with your own code. For production code, you also need to check your dependencies. Especially unsafe code would be a concern. This can be quite challenging, especially if you have a lot of dependencies.

到目前为止, 我们只介绍了你自己的代码的问题. 对于生产环境代码, 您还需要检查依赖项. 尤其是不安全的代码将是一个问题. 这可能非常具有挑战性, 尤其是在您有很多依赖项的情况下.

[`cargo-geiger`](https://github.com/geiger-rs/cargo-geiger) is a neat tool that checks your dependencies for unsafe code. It can help you identify potential security risks in your project.

[`cargo-geiger`](https://github.com/geiger-rs/cargo-geiger) 是一个简洁的工具, 可以检查你的依赖项是否存在不安全的代码. 它可以帮助您识别项目中的潜在安全风险.

```sh
cargo install cargo-geiger
cargo geiger
```

This will give you a report of how many unsafe functions are in your dependencies. Based on this, you can decide if you want to keep a dependency or not.

这将为你提供一份报告, 说明你的依赖项中有多少不安全的函数. 基于此, 您可以决定是否要保留依赖项.

### Clippy Can Prevent Many Of These Issues | Clippy 可以防止许多这些问题

Here is a set of clippy lints that can help you catch these issues at compile time. See for yourself in the [Rust playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=26fffd0b9c89822295c4225182238c8c).

下面是一组 clippy lint, 可以帮助您在编译时捕获这些问题. 尝试在 [Rust playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=26fffd0b9c89822295c4225182238c8c) 中使用 clippy 吧!

Here’s the gist:

要点如下:

- cargo check will not report any issues.

  cargo check 不会报告任何问题.

- cargo run will panic or silently fail at runtime.

  cargo run 将在运行时 panic 或静默失败.

- cargo clippy will catch all issues at compile time (!) 😎

  cargo clippy 将在编译时捕获所有问题 (!) 😎

```rust,no_run
// 算术运算
#![deny(arithmetic_overflow)] // 防止导致整数溢出的操作
#![deny(clippy::checked_conversions)] // 建议在数值类型间使用受检转换
#![deny(clippy::cast_possible_truncation)] // 检测可能导致值截断的类型转换
#![deny(clippy::cast_sign_loss)] // 检测可能丢失正负值信息的类型转换
#![deny(clippy::cast_possible_wrap)] // 检测可能导致值回绕的类型转换
#![deny(clippy::cast_precision_loss)] // 检测可能丢失精度的类型转换
#![deny(clippy::integer_division)] // 高亮整数除法截断导致的潜在错误
#![deny(clippy::arithmetic_side_effects)] // 检测具有潜在副作用的算术运算
#![deny(clippy::unchecked_duration_subtraction)] // 确保持续时间减法不会导致下溢

// 解包操作
#![warn(clippy::unwrap_used)] // 不鼓励使用可能导致 panic 的 `.unwrap()`
#![warn(clippy::expect_used)] // 不鼓励使用可能导致 panic 的 `.expect()`
#![deny(clippy::panicking_unwrap)] // 禁止对已知会引发 panic 的值进行解包
#![deny(clippy::option_env_unwrap)] // 禁止解包可能不存在的环境变量

// 数组索引
#![deny(clippy::indexing_slicing)] // 避免直接数组索引, 使用更安全的方法如 `.get()`

// 路径处理
#![deny(clippy::join_absolute_paths)] // 防止与绝对路径拼接时出现问题

// 序列化问题
#![deny(clippy::serde_api_misuse)] // 防止错误使用 serde 的序列化/反序列化API

// 无界输入
#![deny(clippy::uninit_vec)] // 防止创建未初始化的向量 (不安全操作)

// 不安全代码检测
#![deny(clippy::transmute_int_to_char)] // 防止从整数到字符的不安全类型转换
#![deny(clippy::transmute_int_to_float)] // 防止从整数到浮点数的不安全类型转换
#![deny(clippy::transmute_ptr_to_ref)] // 防止从指针到引用的不安全类型转换
#![deny(clippy::transmute_undefined_repr)] // 检测具有潜在未定义表示的类型转换

use std::path::Path;
use std::time::Duration;

fn main() {
    // ARITHMETIC ISSUES

    // Integer overflow: This would panic in debug mode and silently wrap in release
    let a: u8 = 255;
    let _b = a + 1;

    // Unsafe casting: Could truncate the value
    let large_number: i64 = 1_000_000_000_000;
    let _small_number: i32 = large_number as i32;

    // Sign loss when casting
    let negative: i32 = -5;
    let _unsigned: u32 = negative as u32;

    // Integer division can truncate results
    let _result = 5 / 2; // Results in 2, not 2.5

    // Duration subtraction can underflow
    let short = Duration::from_secs(1);
    let long = Duration::from_secs(2);
    let _negative = short - long; // This would underflow

    // UNWRAP ISSUES

    // Using unwrap on Option that could be None
    let data: Option<i32> = None;
    let _value = data.unwrap();

    // Using expect on Result that could be Err
    let result: Result<i32, &str> = Err("error occurred");
    let _value = result.expect("This will panic");

    // Trying to get environment variable that might not exist
    let _api_key = std::env::var("API_KEY").unwrap();

    // ARRAY INDEXING ISSUES

    // Direct indexing without bounds checking
    let numbers = vec![1, 2, 3];
    let _fourth = numbers[3]; // This would panic

    // Safe alternative with .get()
    if let Some(fourth) = numbers.get(3) {
        println!("{fourth}");
    }

    // PATH HANDLING ISSUES

    // Joining with absolute path discards the base path
    let base = Path::new("/home/user");
    let _full_path = base.join("/etc/config"); // Results in "/etc/config", base is ignored

    // Safe alternative
    let base = Path::new("/home/user");
    let relative = Path::new("config");
    let full_path = base.join(relative);
    println!("Safe path joining: {:?}", full_path);

    // UNSAFE CODE ISSUES

    // Creating uninitialized vectors (could cause undefined behavior)
    let mut vec: Vec<String> = Vec::with_capacity(10);
    unsafe {
        vec.set_len(10); // This is UB as Strings aren't initialized
    }
}
```

## Conclusion | 结论

Phew, that was a lot of pitfalls! How many of them did you know about?

呼, 陷阱真多啊! 其中多少个你之前有意识到了呢?

Even if Rust is a great language for writing safe, reliable code, developers still need to be disciplined to avoid bugs.

即使 Rust 是督促开发者编写安全可靠代码的好语言, 开发人员仍然需要遵守一些约定以避免错误.

A lot of the common mistakes we saw have to do with Rust being a systems programming language: In computing systems, a lot of operations are performance critical and inherently unsafe. We are dealing with external systems outside of our control, such as the operating system, hardware, or the network. The goal is to build safe abstractions on top of an unsafe world.

我们看到的许多常见错误都与 Rust 是一种系统编程语言有关: 在计算系统中, 很多操作都对性能至关重要, 本质上是不安全的. 我们正在处理我们无法控制的外部系统, 例如作系统、硬件或网络. 我们的目标是在这不安全的世界之上构建安全的抽象.

Rust shares an FFI interface with C, which means that it can do anything C can do. So, while some operations that Rust allows are theoretically possible, they might lead to unexpected results.

Rust 与 C 共享 FFI 接口规范, 这实际上意味着它可以做 C 可以做的任何事情. 因此, 即便 Rust 允许的一些操作也可能会导致意外结果.

But not all is lost! If you are aware of these pitfalls, you can avoid them, and with the above clippy lints, you can catch most of them at compile time.

亡羊补牢! 如果你意识到这些陷阱, 你可以轻松避免它们, 使用上述 clippy lints, 你可以在编译时捕获其中的大部分. 

That’s why testing, linting, and fuzzing are still important in Rust.

这就是为什么测试、linting 和模糊测试在 Rust 中仍然很重要.

For maximum robustness, combine Rust’s safety guarantees with strict checks and strong verification methods.

为了获得最大的稳健性, 请将 Rust 的安全保证与严格的检查和强大的验证方法相结合.
