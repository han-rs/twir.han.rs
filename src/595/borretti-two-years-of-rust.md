<!-- ---
author: Fernando Borretti, translated by Hantong Chen
title: "我使用 Rust 的这两年"
pubDatetime: 2025-05-31T15:50:00.000+08:00
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
> 本文翻译自 Fernando Borretti 的博客文章 [https://borretti.me/article/two-years-of-rust](https://borretti.me/article/two-years-of-rust), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 5 月 31 日下午, 于北京.

![GitHub last commit](https://img.shields.io/github/last-commit/han-rs/twir.han.rs?path=src%2F595%2Fborretti-two-years-of-rust.md&style=social&label=Last%20updated)

# 我使用 Rust 的这两年

I recently wrapped up a job where I spent the last two years writing the backend of a B2B SaaS product in Rust,
so now is the ideal time to reflect on the experience and write about it.

我最近结束了一份工作, 过去两年我一直在用 Rust 编写一个 B2B SaaS 产品的后端. 现在是回顾这段经历并落笔记录下它的理想时机.

## Contents | 目录

## Learning | Rust 学习之路

I didn’t learn Rust the usual way: by reading tutorials, or books; or writing tiny projects. Rather, I would say that I studied Rust, as part of the research that went into building Austral. I would read papers about Rust, and the specification, and sometimes I’d go on the Rust playground and write a tiny program to understand how the borrow checker works on a specific edge case.

我入门 Rust 的方式并不寻常: 既没有阅读教程或书籍, 也没有编写过小型项目. 更准确地说, 我是在研究构建 Austral 语言的过程中, 将 Rust 作为研究对象来学习的. 我会阅读关于 Rust 的论文和规范文档, 有时还会在 Rust Playground 上编写小程序, 以理解借用检查器在特定边缘情况下的工作原理.

So, when I started working in Rust, my knowledge was very lopsided: I had an encyclopedic knowledge of the minutiae of the borrow checker, and couldn’t have told you how to write "Hello, world!". The largest Rust program I had written was maybe 60 lines of code and it was to empirically test how trait resolution works.

所以, 当我开始使用 Rust 工作时, 难免有点 "眼高手低": 我对借用检查器的细节了如指掌, 却不知道如何写 "Hello, world!". 我写过的最长的 Rust 程序大概只有 60 行代码, 那是为了测试验证 trait 解析是如何工作的.

This turned out fine. Within a day or two I was committing changes. The problem is when people ask me for resources to learn Rust, I draw a blank.

结果还不错, 一两天内我就开始提交我的补丁了. 问题是, 当有人问我学习 Rust 的资源时, 我却一时想不起来.

## The Good | 优点

The way I would summarize Rust is: it’s a better Go, or a faster Python. It’s fast and statically-typed, it has SOTA tooling, and a great ecosystem. It’s not hard to learn. It’s an industrial language, not an academic language, and you can be immensely productive with it. It’s a general-purpose language, so you can build [backends](https://github.com/tokio-rs/axum), [CLIs](https://docs.rs/clap/latest/clap/), [TUIs](https://github.com/ratatui/ratatui), [GUIs](https://gtk-rs.org/), and embedded firmware. The two areas where it’s not yet a good fit are web frontends (though you can try) and native macOS apps.

我认为 Rust 是一个更好的 Go, 或者更快的 Python. 它速度快且静态类型化, 拥有最先进的工具链和强大的生态系统. 学习起来并不困难. 它是一门工业级语言, 而非学术语言, 使用它可以极大提升生产力. 作为通用编程语言, 你可以用它构建[后端](https://github.com/tokio-rs/axum)、[CLI](https://docs.rs/clap/latest/clap/)、[TUI](https://github.com/ratatui/ratatui)、[GUI](https://gtk-rs.org/) 以及嵌入式固件. 目前它还不适合的两个领域是网页前端 (尽管可以尝试) 和原生 macOS 应用开发.

### Performance | 性能

Rust is fast.

Rust 很快.

You can write slow code in any language: quadratic loops and n+1 queries and bad cache usage. But these are discrete bottlenecks. In Rust, when you fix the bottlenecks, the program is fast.

你可以用任何语言写出垃圾代码, 譬如嵌套循环、n+1 查询和糟糕的缓存操作. 但这些是散在的瓶颈. 在 Rust 中, 当你修复这些瓶颈时, 程序就会变得很快.

In other languages performance problems are often pervasive,
so e.g. in Python it’s very common to have a situation where you’ve fixed all the bottlenecks—and everything is still unacceptably slow. Why? Because in Python the primitives are 10x to 100x slower than in Rust, and the composition of slow primitives is a slow program. No matter how much you optimize within the program, the performance ceiling is set by the language itself.

在其他语言中, 性能问题往往普遍存在. 例如, 在 Python 中, 经常会出现这样的情况: 你已经解决了所有的瓶颈, 但程序仍然慢得无法接受. 为什么? 因为在 Python 中, 基本操作的执行速度比 Rust 慢 10 到 100 倍, 而由这些慢速基本操作组成的程序自然也是慢的. 无论你在程序内部如何优化, 性能的上限都是由语言本身决定的.

And when you find yourself in that situation, what is there to do? You can scale the hardware vertically, and end up like those people who spend five figures a month on AWS to get four requests per second. You can keep your dependencies up to date, and hope that the community is doing the work of improving performance. And you can use async as much as possible on the belief that your code is I/O-bound, and be disappointed when it turns out that actually you’re CPU-bound.

而当你发现自己处于那种境地时, 该怎么办呢? 你可以纵向扩展硬件, 最终像那些每月在 AWS 上花费五位数却只能处理每秒四个请求的人一样. 你可以保持依赖项的最新状态, 并希望社区正在努力提升性能. 你也可以尽可能多地使用异步, 坚信你的代码是 I/O 密集型的, 结果却发现实际上是 CPU 密集型的, 失望.

By having a high performance ceiling, Rust lets you write programs that are default fast without thinking too much about optimization, and when you need to improve performance, you have a lot of room to optimize before you hit the performance ceiling.

通过提供一个高的性能下限, Rust 让你无需过多考虑优化就能编写出高性能的程序; 而当需要提升性能时, 在触及性能上限前你仍有大量优化空间.

### Tooling | 工具

[Cargo](https://doc.rust-lang.org/cargo/) has the best DX of any build system+package manager I have used. Typically you praise the features of a program, with cargo you praise the absences: there’s no gotchas, no footguns, no lore you have to learn in anger, no weirdness, no environment variables to configure, no virtualenvs to forget to activate. When you copy a command from the documentation and run it, it works, it doesn’t spit out a useless error message that serves only as a unique identifier to find the relevant StackOverflow / Discourse thread.

对比我用过的其他所有构建系统外加包管理器, [Cargo](https://doc.rust-lang.org/cargo/) 给了我最好的开发者体验. 通常你会去称赞一个程序的功能, 而对于 Cargo, 你称赞的是它的默默无闻: 没有陷阱, 没有隐患, 没有需要痛苦学习的知识, 没有古怪之处, 没有需要配置的环境变量, 没有忘记激活的虚拟环境. 当你从官方文档中复制命令并运行时, 它(大概率)能正常工作, 而不是直接吐出一个作用仅限于作为搜索相关的 StackOverflow / Discourse 帖子的关键词的错误消息.

Much of the DX virtues are downstream of the fact that cargo is entirely declarative rather than stateful. An example: something that always trips me up with npm is when I update the dependencies in the package.json, running the type-checker/build tool/whatever doesn’t pick up the change. I get an unexpected error and then I go, oh, right, I have to run `npm install` first. With cargo, if you update the dependencies in the Cargo.toml file, any subsequent command (cargo check or build or run) will first resolve the dependencies, update Cargo.lock, download any missing dependencies, and then run the command. The state of (Cargo.toml, Cargo.lock, local dependency store) is always synchronized.

Cargo 的诸多开发者体验优势源于其完全声明式而非状态化的特性. 举个例子: 使用 npm 时, 一个总让我困扰的问题是, 当我更新了 package.json 中的依赖项后, 运行类型检查器/构建工具等却无法感知变更. 我会遇到意外错误, 然后才反应过来: 哦对, 得先运行 `npm install`. 而 Cargo 则不同, 如果你更新了 Cargo.toml 文件中的依赖, 后续任何命令都会先解析依赖关系、更新 Cargo.lock、下载缺失的依赖项, 再执行原命令. 整个系统 (Cargo.toml、Cargo.lock、本地依赖缓存) 的状态始终保持同步.

### Type Safety | 类型安全

Rust has a good type system: sum types with exhaustiveness checking, option types instead of null, no surprising type conversions. Again, as with tooling, what makes a type system good is a small number of features, and a thousand absences, mistakes that were not made.

Rust 拥有良好的类型系统: 带有穷尽性检查的求和类型、使用 Option 类型而非 null、没有意外的类型转换. 与优秀的工具链一样, 一个好的类型系统的关键在于维持有限必要特性, 避免无数错误.

The practical consequence is you have a high degree of confidence in the robustness of your code. In e.g. Python the state of nature is you have zero confidence that the code won’t blow up in your face, so you spend your time writing tests (to compensate for the lack of a type system) and waiting for the tests to clear CI (because Python is slow as shit). In Rust you write the code and if it compiles, it almost always works.
Writing tests can feel like a chore because of how rarely they surface defects.

由此, 你能完全信任你写出来的代码的健壮性. 而在 Python 中, 一般情况下下你完全无法确信代码不会在你面前崩溃, 因此你还得花时间编写测试 (以弥补类型系统的缺失), 并等待测试通过 CI (因为 Python 慢得要命). 而在 Rust 中, 代码能编译通过就能跑. 编写测试可能感觉像件苦差事, 因为它们极少暴露出缺陷.

(译者注: 夸张了点, 逻辑错误还是得好好写测试用例去验证的, 不能想当然.)

To give an example: I don’t really know how to debug Rust programs because I never had to. The only parts of the code I had to debug were the SQL queries, because SQL has many deficiencies. But the Rust code itself was overwhelmingly solid. When there were bugs, they were usually conceptual bugs, i.e., misunderstanding the specification. The type of bugs that you can make in any language and that testing would miss.

举个例子: 我其实不太知道如何调试 Rust 程序, 因为我从不需要这么做. 我唯一需要调试的代码部分是 SQL 查询, 因为 SQL 有很多缺陷. 而 Rust 代码本身极其稳健. 当出现 bug 时, 通常是概念性错误, 也就是对规范的理解有误. 这类错误在任何语言中都可能发生, 而且测试也无法发现.

### Error Handling | 错误处理

There’s two ways to do errors: traditional exception handling (as in Java or Python) keeps the happy path free of error-handling code, but makes it hard to know the set of errors that can be raised at a given program point. Errors-as-values, as in Go, makes error handling more explicit at the cost of being very verbose.

有两种处理错误的方式: 传统的异常处理（如Java或Python）让主逻辑路径保持干净, 不掺杂错误处理代码, 但难以明确知道在特定程序点可能抛出哪些错误.
而像 Go 语言那样将错误作为返回值, 虽然让错误处理更加显式, 但代价是代码变得非常冗长.

Rust has a really nice solution where errors are represented as ordinary values, but there’s syntactic sugar that means you don’t have to slow down to write `if err != nil` a thousand times over.

Rust 有一个非常优雅的解决方案, 它将错误表示为普通值, 但通过语法糖的修饰, 你无需反复书写 `if err != nil` 上千次而降低效率.

In Rust, an error is any type that implements the `Error` trait. Then you have the `Result` type:

在 Rust 中, 任何实现了 `Error` trait 的类型都是一个错误类型. 然后还有 `Result` 类型.

```rust,no_run
enum Result<T, E: Error> {
    Ok(T),
    Err(E)
}
```

Functions which are fallible simply return a `Result`, e.g.:

可能出错的函数只需返回一个 `Result`, 例如:

```rust,no_run
enum DbError {
    InvalidPath,
    Timeout,
    // ...
}

fn open_database(path: String) -> Result<Database, DbError>
```

The question mark operator, `?`, makes it possible to write terse code that deals with errors. Code like this:

问号操作符 `?` 使得编写简洁的错误处理代码成为可能. 类似这样的代码:

```rust,no_run
fn foo() -> Result<(), DbError> {
    let db = open_database(path)?;
    let tx = begin(db)?;
    let data = query(tx, "...")?;
    rollback(tx)?;
    Ok(())
}
```

Is transformed to the much more verbose:

解语法糖后类似这样:

```rust,no_run
fn foo() -> Result<(), DbError> {
    let db = match open_database(path) {
        Ok(db) => db,
        Err(e) => {
            // Rethrow.
            return Err(e);
        }
    };
    let tx = match begin(db) {
        Ok(tx) => tx,
        Err(e) => {
            return Err(e);
        }
    };
    let data = match query(tx, "...") {
        Ok(data) => data,
        Err(e) => {
            return Err(e);
        }
    };
    match rollback(tx) {
        Ok(_) => (),
        Err(e) => {
            return Err(e);
        }
    };
    Ok(())
}
```

When you need to explicitly handle an error, you omit the question mark operator and use the `Result` value directly.

当你需要显式处理错误时, 可以(像这样)省略问号运算符并直接处理 `Result` 值.

### The Borrow Checker | 借用检查器

The borrow checker is Rust’s headline feature: it’s how you can have memory safety without garbage collection, it’s the thing that enables "fearless concurrency". It’s also, for most people, the most frustrating part of learning and using Rust.

借用检查器是 Rust 的标志性特性: 它让你无需垃圾回收即可实现内存安全, 也是实现 "无畏并发" 的关键所在. 然而对大多数人而言, 这恰恰也是学习和使用 Rust 过程中最令人沮丧的部分.

Personally I didn’t have borrow checker problems, but that’s because before I started using Rust at work I’d designed and built my own borrow checker. I don’t know if that’s a scalable pedagogy. Many people report they have to go through a lengthy period of fighting the borrow checker, and slowly their brain discovers the implicit ruleset, and eventually they reach a point where they can write code without triggering inscrutable borrow checker errors. But that means a lot of people drop out of learning Rust because they don’t like fighting the borrow checker.

就我个人而言, 我没有遇到过借用检查器的问题, 但那是因为在我开始在工作中使用 Rust 之前, 我已经设计并构建了自己的借用检查器. 我不确定这是否是一种可扩展的教学方法. 许多人反映他们必须经历一段漫长的与借用检查器斗争的过程, 慢慢地他们的大脑会习惯那些隐含的约束, 最终他们会达到一个直接码代码而不会触发难以理解的借用检查器错误的阶段. 但这也意味着很多人因为不喜欢与借用检查器斗争而放弃了学习 Rust.

So, how do you learn Rust more effectively, without building your own compiler, or banging your head against the borrow checker?

那么, 如何更有效地学习 Rust, 而不必自己构建编译器, 或者与借用检查器较劲呢?

Firstly, it’s useful to understand the concepts behind the borrow checker, the "aliased XOR mutable" rule, the motivation behind linear types, etc.
Unfortunately I don’t have a canonical resource that explains it ab initio.

首先, 了解借用检查器背后的概念、"别名 XOR 可变" 规则、线性类型动机等是有用的. 不幸的是, 我没有一个从头开始解释这些内容的权威资源.

Secondly, a change in mindset is useful: a lot of people’s mental model of the borrow checker is as something bolted "on top" of Rust, like a static analyzer you can run on a C/C++ codebase, which just happens to be built into the compiler. This mindset leads to fighting the system, because you think: my code is legitimate, it type-checks, all the types are there, it’s only this final layer, the borrow checker, that objects. It’s better to think of the borrow checker as an intrinsic part of the language semantics. Borrow checking happens, necessarily, after type-checking (because it needs to know the types of terms), but a program that fails the borrow checker is as invalid as a program that doesn’t type-check. Rather than mentally implementing something in C/C++, and then thinking, "how do I translate this to Rust in a way that satisfies the borrow-checker?", it’s better to think, "how can I accomplish the goal within the semantics of Rust, thinking in terms of linearity and lifetimes?". But that’s hard, because it requires a high level of fluency.

其次, 转变思维方式很有帮助: 许多人将借用检查器视为 "附加" 在 Rust 之上的东西, 就像可运行于 C/C++ 代码库的静态分析工具, 只不过被内置在编译器中. 这种思维会导致与系统对抗, 因为你会想: 我的代码是合法的, 通过了类型检查, 所有类型都正确, 只是这最后一关——借用检查器在反对. 更好的方式是将借用检查器视为语言语义的内在组成部分. 借用检查必然发生在类型检查之后 (因为它需要知道各术语的类型), 但一个无法通过借用检查的程序, 其无效性等同于类型检查失败的程序. 与其先在脑海中用 C/C++ 实现功能, 再思考 "如何将其翻译成满足借用检查器要求的 Rust 代码", 不如直接思考 "如何在 Rust 的语义框架下, (基于线性类型及生命周期思维) 直接地实现目标". 但这很难, 因为这需要高度的语言熟练度.

When you are comfortable with the borrow checker, life is pretty good. "Fighting the borrow checker" isn’t something that happens. When the borrow checker complains it’s either because you’re doing something where multiple orthogonal features impinge on each other (e.g. async + closures + borrowing) or because you’re doing something that’s too complex, and the errors are a signal you have to simplify. Often, the borrow checker steers you towards designs that have mechanical sympathy, that are aligned with how the hardware works. When you converge on a design that leverages lifetimes to have a completely `clone()`-free flow of data, it is really satisfying. When you design a linearly-typed API where the linearity makes it really hard to misuse, you’re grateful for the borrow checker.

当你适应借用检查器后, 生活会变得轻松愉快. "与借用检查器搏斗" 的情形将不复存在. 当借用检查器报错时, 要么是因为你在处理多个特性相互交织的场景(例如异步+闭包+借用), 要么是因为设计过于复杂, 错误提示正是需要简化的信号. 通常, 借用检查器会引导你走向具有机器亲和力的设计, 与硬件工作原理相契合. 当你设计出利用生命周期实现完全无需 `clone()` 的数据流时, 会感到无比满足. 当你设计出线性类型 API, 其线性特性让误用变得极其困难时, 你会由衷感激借用检查器的存在.

### Async | 异步

Everyone complains about async. They complain that it’s too complex or they invoke that thought-terminating cliche about "coloured functions". It’s easy to complain about something when comparing it to some vague, abstract, ideal state of affairs; but what, exactly, is the concrete and existing alternative to async?

每个人都抱怨异步编程. 他们抱怨它太复杂, 或者搬出那个终结思考的陈词滥调——"函数染色". 当将某物与某种模糊、抽象的理想状态相比较时, 抱怨是很容易的; 但是, 具体且现实存在的异步替代方案到底是什么呢?

The binding constraint is that OS threads are slow. Not accidentally but intrinsically, because of the kernel, and having to swap the CPU state and stack on each context switch. OS threads are never going to be fast. If you want to build high-performance network services, it matters a lot how many concurrent connections and how much throughput you can get per CPU. So you need an alternative way to do concurrency that lets you maximize your hardware resources.

核心限制在于操作系统线程速度慢. 这不是偶然的, 而是本质上的问题, 原因在于内核以及每次上下文切换时都需要交换 CPU 状态和堆栈. 操作系统线程永远不会快. 如果你想构建高性能的网络服务, 每个 CPU 能处理多少并发连接和吞吐量就非常重要. 因此, 你需要一种替代的并发方式, 以最大化利用硬件资源.

And there are basically two alternatives.

基本上有两种选择.

- Green threads, which give programmers the same semantics as OS threads (good!) but often leave a lot of performance on the table (bad!) because you need to allocate memory for each thread’s stack and you need a runtime scheduler to do preemptive multitasking.

  绿色线程 (Green thread) 为程序员提供了与操作系统线程相同的语义 (优势), 但由于需要为每个线程的栈分配内存, 并且需要一个运行时调度器来实现抢占式多任务处理, 它们往往牺牲了大量性能 (劣势).

- Stackless coroutines, as in Rust, which add complexity to the language semantics and implementation (bad!) but have a high performance ceiling (good!).

  无栈协程, 如 Rust 中的实现, 虽然增加了语言的语义和实现的复杂性 (劣势), 但具有很高的性能上限 (优势).

From the perspective of a language implementor, or someone who cares about specifying the semantics of programming languages, `async` is not a trivial feature. The intersection of `async` and lifetimes is hard to understand. From the perspective of a library implementor, someone who writes the building blocks of services and is down in the trenches with `Pin` / `Poll` / `Future` , it’s rough.

从语言实现者或关心编程语言语义规范的人的角度来看, `async` 并非一个简单的特性. `async` 与生命周期的交集难以理解. 而从库实现者的角度来看, 那些编写服务构建块并与 `Pin` / `Poll` / `Future` 打交道的人, 这确实很棘手.

But from the perspective of a user, async Rust is pretty good. It mostly "just works". The user perspective is you put `async` in front of function definitions that perform IO and you put `await` at the call sites and that’s it. The only major area where things are unergonomic is calling async functions inside iterators.

但从用户的角度来看, 异步 Rust 相当不错. 它基本上 "开箱即用". 用户视角是: 你在执行 IO 的函数定义前加上 `async`, 在调用处加上 `await`, 就完事了. 唯一不够顺手的地方是在迭代器内部调用异步函数.

### Refactoring | 重构

It’s paint by numbers. The type errors make refactoring extremely straightforward and safe.

何尝不是 "枯燥无味" 的工作: (Rust 对重构中极可能引入的)类型错误 (的提示) 使得重构变得极其直接和安全.

### Hiring | 招聘

Is it hard to hire Rust programmers? No.

Rust 程序员难招吗? 不难.

First, mainstream languages like Python and TypeScript are so easy to hire for that they wrap back around and become hard. To find a truly talented Python programmer you have to sift through a thousand resumes.

首先, 像 Python 和 TypeScript 这样的主流语言因为招聘太容易, 反而变得困难. 要找到一个真正有才华的Python程序员, 你得筛选上千份简历.

Secondly, there’s a selection effect for quality. "Has used Rust", "has written open-source code in Rust", or "wants to use Rust professionally" are huge positive signals about a candidate because it says they are curious and they care about improving their skills.

其次, 质量上存在筛选效应. "使用过 Rust"、"用 Rust 编写过开源代码" 或 "希望专业使用 Rust" 这些信号对候选人而言是巨大的加分项, 因为这表明他们 (对编程) 充满好奇心且注重提升自身技能.

Personally I’ve never identified as a "Python programmer" or a "Rust programmer". I’m just a programmer! When you learn enough languages you can form an orthogonal basis set of programming concept and translate them across languages. And I think the same is true for the really talented programmers: they are able to learn the language quickly.

我个人从未自称为 "Python程序员" 或 "Rust程序员". 我只是个程序员! 当你掌握足够多的语言时, 就能构建编程概念的交界理解, 并在不同语言间转换它们. 我认为真正有才华的程序员也是如此: 他们能快速掌握新语言.

### Affect | 直接影响

Enough about tech. Let’s talk about feelings.

科技的话题就到此为止吧. 我们来谈谈感受.

When I worked with Python+Django the characteristic feeling was anxiety. Writing Python feels like building a castle out of twigs, and the higher you go, the stronger the wind gets. I expected things to go wrong, I expected the code to be slow, I expected to watch things blow up for the most absurd reasons. I had to write the code defensively, putting type assertions everywhere.

当我使用 Python+Django 工作时, 那种特有的感觉是焦虑. 写 Python 就像用细树枝搭建城堡, 爬得越高, 风就越大. 我预料事情会出错, 预料代码会运行缓慢, 预料会因为最荒谬的原因看着一切崩溃. 我不得不防御性地编写代码, 到处加上类型断言.

Rust feels good. You can build with confidence. You can build things that not only work as desired but which are also beautiful. You can be proud of the work that you do, because it’s not slop.

Rust 让人感觉很好. 你可以充满信心地构建. 你不仅可以构建出按预期工作的东西, 还能创造出优美的作品. 你可以为自己的工作感到自豪, 因为它不是粗制滥造的.

## The Bad | 缺点

This section describes the things I don’t like.

这一部分描述的是我不喜欢的事情.

### The Module System | module 系统

In Rust, there’s two levels of code organization:

在 Rust 中, 代码组织有两个层次:

- Modules are namespaces with visibility rules.

  `module` 是具有可见性规则的命名空间.

- Crates are a collection of modules, and they can depend on other crates. Crates can be either executables or libraries.

  `crate` 是模块的集合, 它们可以依赖于其他 crates. crate 可以是可执行文件或库.

A project, or workspace, can be made up of multiple crates. For example a web application could have library crates for each orthogonal feature and an executable crate that ties them together and starts the server.

一个项目或工作空间 (workspace) 可以由多个 crate 组成.例如, 一个网络应用程序可以为每个共用功能提取为 crate, 并准备一个 crate 将它们整合在一起编译为可执行文件.

What surprised me was learning that modules are not compilation units, and I learnt this by accident when I noticed you can have a circular dependency between modules within the same crate[^1]. Instead, crates are the compilation unit. When you change any module in a crate, the entire crate has to be recompiled. This means that compiling large crates is slow, and large projects should be broken down into many small crates, with their dependency DAG arranged to maximize parallel compilation.

让我惊讶的是, 模块并不是编译单元, 这一点是我偶然发现的, 当时我注意到在同一 crate[^1] 中的模块之间可以存在循环依赖. 实际上, crate 才是编译单元. 当你修改 crate 中的任何模块时, 整个 crate 都必须重新编译. 这意味着编译大型 crate 会很慢, 因此大型项目应该被分解成许多小型 crate, 并通过安排它们的依赖关系图来最大化并行编译的效率.

[^1]: If modules were separate compilation units this wouldn’t work. If module A depends on B, to compile A you need to first compile B to know what declarations it exports and what their types are. But if B also depends on A, you have an infinite regression. 如果模块是独立的编译单元, 这就行不通了. 如果模块 A 依赖于 B, 要编译 A, 你需要先编译 B, 以了解它导出了哪些声明以及它们的类型是什么. 但如果 B 也依赖于 A, 你就会陷入无限递归.

This is a problem because creating a module is cheap, but creating a crate is slow. Creating a new module is just creating a new file and adding an entry for it in the sibling mod.rs file. Creating a new crate requires running cargo new, and don’t forget to set publish = false in the Cargo.toml, and adding the name of that crate in the workspace-wide Cargo.toml so you can import it from other crates. Importing a symbol within a crate is easy: you start typing the name, and the LSP can auto-insert the use declaration, but this doesn’t work across crates, you have to manually open the Cargo.toml file for the crate you’re working on and manually add a dependency to the crate you want to import code from. This is very time-consuming.

问题在于创建 module 成本低廉, 但创建 crate 却耗时费力. 新建模块只需创建文件并在同级 mod.rs 中添加条目 (译者注: 现在推荐创建 xxx.rs, 在 xxx.rs 所在目录下创建同名文件夹 `xxx`, 然后在 xxx.rs 里写子 module, 如 `mod yyy`, 然后创建 `xxx/yyy.rs` 即可, 不需要 mod.rs 了), 而新建 crate 则需运行 `cargo new` 命令, 别忘了在 Cargo.toml 中设置 publish = false, 还要在全局工作空间的 Cargo.toml` 中添加该 `crate` 名称以便其他 `crate` 引用. 在同一个 crate 内引入依赖很简单: 输入名称时 LSP 能自动插入 use 声明, 但跨 crate 时这招就失效了. 你必须手动打开当前 crate 的 Cargo.toml 文件, 手工添加对目标 crate 的依赖才能使用. 整个过程极其耗时.

Another problem with crate-splitting is that `rustc` has a really nice feature that warns you when code is unused. It’s very thorough and I like it because it helps to keep the codebase tidy. But it only works within a crate. In a multi-crate workspace, declarations that are exported publicly in a crate, but not imported by any other sibling crates, are not reported as unused.[^2]

crate 拆分带来的另一个问题是, `rustc` 有个非常实用的功能: 当代码未被使用时它会发出警告. 这个功能非常全面, 我很喜欢它, 因为它有助于保持代码库的整洁. 但它仅在单个 crate 内部有效. 在多 crate 工作区中, 某个 crate 公开导出但未被任何同级 crate 导入, 不会被标记为未使用代码.[^2]

[^2]: One way to fix this is to make extremely fine-grained crates, and rely on `cargo-machete` to identify unused code at the dependency level. But this would take up way too much time. 一种解决方法是创建极其细粒度的crate, 并依赖 `cargo-machete` 在依赖项级别识别未使用的代码. 但这会占用太多时间.

So if you want builds to be fast, you have to completely re-arrange your architecture and manually massage the dependency DAG and also do all this make-work around creating and updating crate metadata. And for that you gain… intra-crate circular imports, which are a horrible antipattern and make it much harder to understand the codebase. I would much prefer if modules were disjoint compilation units.

所以, 如果你想构建速度快, 就必须彻底重新安排你的架构, 手动调整依赖关系的有向无环图, 还要做所有这些创建和更新 crate 元数据的无用功. 而你所得到的... 是 crate 内部的循环导入, 这是一种非常糟糕的反模式, 会让代码库更难理解. 我宁愿模块是独立的编译单元.

I also think the module system is just a hair too complex, with re-exports and way too many ways to import symbols. It could be stripped down a lot.

我也认为模块系统有点过于复杂了, 包括重新导出和导入符号的方式太多.可以大幅简化.

### Build Performance | 构建性能

The worst thing about the Rust experience is the build times. This is usually blamed on LLVM, which, fair enough, but I think part of it is just intrinsic features of the language, like the fact that modules are not independent compilation units, and of course monomorphization.

Rust体验中最糟糕的事情就是编译时间. 这通常归咎于 LLVM, 虽然确实如此, 但我认为部分原因在于语言本身的固有特性, 比如模块不是独立的编译单元, 当然还有单态化.

There are various tricks to speed up the builds: [caching](https://github.com/Swatinem/rust-cache), [cargo chef](https://github.com/LukeMathWalker/cargo-chef), [tweaking the configuration](https://matklad.github.io/2021/09/04/fast-rust-builds.html). But these are tricks, and tricks are fragile. When you notice a build performance regression, it could be for any number of reasons:

有多种技巧可以加快构建速度: [缓存]((https://github.com/Swatinem/rust-cache)、使用 [cargo chef](https://github.com/LukeMathWalker/cargo-chef)、[调整配置](https://matklad.github.io/2021/09/04/fast-rust-builds.html). 但这些都只是技巧, 而技巧往往是脆弱的. 当你注意到构建性能出现倒退时, 可能的原因有无数种:

- The code is genuinely larger, and takes longer to build.

  代码确实更大了, 构建时间也更长.

- You’re using language features that slow down the frontend (e.g. complex type-level code).

 您正在使用会拖慢前端速度的语言特性 (例如复杂的类型级代码).

- You’re using language features that slow down the backend (e.g. excessive monomorphization).

  您使用的语言特性会拖慢后端性能 (例如过度单态化).

- A proc macro is taking a very long time (`tracing::instrument` in particular is fantastically slow).

  一个过程宏花费了很长时间 (尤其是 `tracing::instrument` 慢得出奇).

- The crate DAG has changed shape, and crates that used to be built in parallel are now being built serially.

  crate 依赖有向无环图的形状发生了变化, 以前可以并行构建的箱子现在需要串行构建.
.
- Any of the above, but in the transitive closure of your dependencies.

  上述任意一项, 但位于你的依赖的依赖中.

- You’ve added/updated an immediate dependency, which pulls in lots of transitive dependencies.

  您添加/更新了一个直接依赖项, 这会引入大量传递依赖项.

- You’re caching too little, causing dependencies to be downloaded.

  你缓存得太少, 导致依赖项需要重新下载.

- You’re caching too much, bloating the cache, which takes longer to download.

  你缓存太多了, 导致缓存膨胀, 下载时间变长.

- The cache was recently invalidated (e.g. by updating Cargo.lock) and has not settled yet.

  缓存最近失效了 (例如通过更新 Cargo.lock) 且尚未稳定下来.

- The CI runners are slow today, for reasons unknowable.

  今天 CI runner 很慢, 原因不明.

- The powerset of all of the above.

  上述所有内容的幂集.

- (Insert Russell’s paradox joke)

  (插入罗素悖论笑话)

It’s not worth figuring out. Just pay for the bigger CI runners. Four or eight cores should be enough. Too much parallelism is waste: run `cargo build` with the `--timings` flag, open the report in your browser, and look at the value of “Max concurrency”. This tells you how many crates can be built in parallel, and, therefore, how many cores you can buy before you hit diminishing returns.

不值得费心去琢磨. 直接花钱买更大的 CI runner 吧. 四核或八核应该足够了. 并行度过高是浪费: 用 `--timings` 标志运行 `cargo build`, 在浏览器中打开报告, 查看 "最大并发数 (max concurrency)" 的值. 这会告诉你可以并行构建多少个 crate, 从而知道在收益递减前可以购买多少核.

The main thing you can do to improve build performance is to split your workspace into multiple crates, and arranging the crate dependencies such that as much of your workspace can be built in parallel. This is easy to do at the start of a project, and very time-consuming after.

提高构建性能的主要方法是将工作区拆分为多个 crate, 并合理安排 crate 之间的依赖关系, 以便尽可能多地并行构建工作区. 这在项目开始时很容易做到, 但之后再做会非常耗时.

### Mocking | 嘲笑

Maybe this is a skill issue, but I have not found a good way to write code where components have swappable dependencies and can be tested independently of their dependencies. The central issue is that lifetimes impinge on late binding.

也许这是一个技术问题, 我想要编写一类代码, 其组件具有可交换的依赖项, 并且可以独立于其依赖项进行测试. 核心问题是生命周期影响了后期绑定.

Consider a workflow for creating a new user in a web application. The three external effects are: creating a record for the user in the database, sending them a verification email, and logging the event in an audit log:

考虑一个在网页应用中创建新用户的工作流程. 三个外部效应分别是: 在数据库中为用户创建记录、向他们发送验证邮件以及在审计日志中记录该事件.

```rust,no_run
fn create_user(
    tx: &Transaction,
    email: Email,
    password: Password
) -> Result<(), CustomError>  {
    insert_user_record(tx, &email, &password)?;
    send_verification_email(&email)?;
    log_user_created_event(tx, &email)?;
    Ok(())
}
```

Testing this function requires spinning up a database and an email server. No good! We want to detach the workflow from its dependencies, so we can test it without transitively testing its dependencies. There’s three ways to do this:

测试此功能需要启动数据库和电子邮件服务器. 这不好! 我们希望将工作流与其依赖项分离, 这样我们就可以在不间接测试其依赖项的情况下进行测试. 有三种方法可以实现这一点.

- Use traits to define the interface, and pass things at compile-time.

  使用 trait 来定义接口, 并在编译时传递参数.

- Use traits to define the interface, and use dynamic dispatch to pass things at run-time.

  使用 trait 来定义接口, 并通过动态分派在运行时传递对象.

- Use function types to define the interface, and pass dependencies as closures.

  使用函数类型来定义接口, 并将依赖项作为闭包传递.

And all of these approaches work. But they require a lot of make-work. In TypeScript or Java or Python it would be painless, because those languages don’t have lifetimes, and so dynamic dispatch or closures “just work”.

所有这些方法都有效. 但它们需要大量额外工作. 在 TypeScript、Java 或 Python 中这会很轻松, 因为这些语言没有生命周期概念, 动态分发或闭包 "直接就能用".

For example, say we’re using traits and doing everything at compile-time. To minimize the work let’s just focus on the dependency that writes the user’s email and password to the database. We can define a trait for it:

例如, 假设我们正在使用 trait 并在编译时完成所有工作. 为了最小化工作量, 我们只关注将用户的电子邮件和密码写入数据库的依赖项. 我们可以为它定义一个特质.

```rust,no_run
trait InsertUser<T> {
    fn execute(
        &mut self,
        tx: &T,
        email: &Email,
        password: &Password
    ) -> Result<(), CustomError>;
}
```

(We’ve parameterized the type of database transactions because the mock won’t use a real database, therefore, we won’t have a way to construct a `Transaction` type in the tests.)

(我们参数化了数据库事务的类型, 因为模拟测试不会使用真实的数据库, 因此在测试中我们将无法构造一个 `Transaction` 类型的实例. )

The real implementation requires defining a placeholder type, and implementing the `InsertUser` trait for it:

真正的实现需要定义一个占位类型 (Marker 类型, 作 ZST), 并为它实现 `InsertUser` trait.

```rust,no_run
struct InsertUserAdapter {}

impl InsertUser<Transaction> for InsertUserAdapter {
    fn execute(
        &mut self,
        tx: &Transaction,
        email: &Email,
        password: &Password
    ) -> Result<(), CustomError> {
        insert_user_record(tx, email, password)?;
        Ok(())
    }
}
```

The mock implementation uses the unit type `()` as the type of transactions:

模拟实现使用 unit 类型 `()` 作为 transaction 的类型.

```rust,no_run
struct InsertUserMock {
    email: Email,
    password: Password,
}

impl InsertUser<()> for InsertUserMock {
    fn execute(
        &mut self,
        tx: &(),
        email: &Email,
        password: &Password
    ) -> Result<(), CustomError> {
        // Store the email and password in the mock object, so
        // we can afterwards assert the right values were passed
        // in.
        self.email = email.clone();
        self.password = password.clone();
        Ok(())
    }
}
```

Finally we can define the `create_user` workflow like this:

最后我们可以这样定义 `create_user` 工作流程.

```rust,no_run
fn create_user<T, I: InsertUser<T>>(
    tx: &T,
    insert_user: &mut I,
    email: Email,
    password: Password,
) -> Result<(), CustomError> {
    insert_user.execute(tx, &email, &password)?;
    // Todo: the rest of the dependencies.
    Ok(())
}
```
The live, production implementation would look like this:

生产实现将如下所示.

```rust,no_run
fn create_user_for_real(
    tx: &Transaction,
    email: Email,
    password: Password,
) -> Result<(), CustomError> {
    let mut insert_user = InsertUserAdapter {};
    create_user(tx, &mut insert_user, email, password)?;
    Ok(())
}
```

While in the unit tests we would instead create a `InsertUserMock` and pass it in:

在单元测试中, 我们会创建一个 `InsertUserMock` 并传入.

```rust,no_run
#[test]
fn test_create_user() -> Result<(), CustomError> {
    let mut insert_user = InsertUserMock {
        email: "".to_string(),
        password: "".to_string()
    };
    let email = "foo@example.com".to_string();;
    let password = "hunter2".to_string();

    create_user(&(), &mut insert_user, email, password)?;

    // Assert `insert_user` was called with the right values.
    assert_eq!(insert_user.email, "foo@example.com");
    assert_eq!(insert_user.password, "hunter2");

    Ok(())
}
```

Obviously this is a lot of typing. Using traits and dynamic dispatch would probably make the code marginally shorter. Using closures is probably the simplest approach (a function type with type parameters is, in a sense, a trait with a single method), but then you run into the ergonomics issues of closures and lifetimes.

显然, 这需要大量输入. 使用 trait 和动态分发可能会使代码稍微简短一些. 使用闭包可能是最简单的方法 (从某种意义上说, 带有类型参数的函数类型就是一种具有单一方法的 `Fn` 系列 trait), 但随后你会遇到闭包和生命周期的使用体验问题.

Again, this might be a skill issue, and maybe there’s an elegant and idiomatic way to do this.

这可能是技术问题, 或许有一种优雅且地道的方法可以做到这一点.

Alternatively, you might deny the entire necessity of mocking, and write code without swappable implementations, but that has its own problems: tests become slower, because you have to spin up servers to mock things like API calls; tests require a lot of code to set up and tear down these dependencies; tests are necessarily end-to-end, and the more end-to-end your tests, the more test cases you need to check every path because of the combinatorial explosion of inputs.

或者, 你可能会完全否定模拟的必要性, 编写没有可交换实现的代码, 但这也有其自身的问题: 测试会变得更慢, 因为你必须启动服务器来模拟诸如 API 调用之类的东西; 测试需要大量代码来设置和拆除这些依赖项; 测试必然是端到端的, 而你的测试越端到端, 由于输入的组合爆炸, 你需要更多的测试用例来检查每条路径.

### Expressive Power | 表现力

It’s easy to go insane with proc macros and trait magic and build an incomprehensible codebase where it’s impossible to follow the flow of control or debug anything. You have to rein it in.

使用过程宏和 trait 魔法很容易让人发疯, 构建出一个难以理解的代码库, 无法跟踪控制流或调试任何东西. 你必须加以控制.
