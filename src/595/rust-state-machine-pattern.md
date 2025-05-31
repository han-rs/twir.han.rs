<!-- ---
author: Ana Hobden, translated by Hantong Chen
title: "Rust 状态机模式"
pubDatetime: 2025-05-31T16:55:00.000+08:00
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
> 本文翻译自 Ana Hobden 的博客文章 [https://hoverbear.org/blog/rust-state-machine-pattern/](https://hoverbear.org/blog/rust-state-machine-pattern/), 英文原文版权由原作者所有, 中文翻译版权遵照 CC BY-NC-SA 协议开放. 如原作者有异议请邮箱联系.
>
> 相关术语翻译依照 [Rust 语言术语中英文对照表](https://i.han.rs/glossary/rust-glossary).
>
> 囿于译者自身水平, 译文虽已力求准确, 但仍可能词不达意, 欢迎批评指正.
>
> 2025 年 5 月 31 日下午, 于北京.

# Rust 状态机模式

Lately I've been thinking a lot about the patterns and structures which we program with. It's really wonderful to start exploring a project and see familiar patterns and styles which you've already used before. It makes it easier to understand the project, and empowers you to start working on the project faster.

最近, 我一直在思考我们编程时使用的模式和结构. 开始探索一个项目并看到你以前已经使用过的熟悉的模式和样式, 这真是太棒了. 它使您更容易理解项目, 并使您能够更快地开始处理项目.

Sometimes you're working on a new project and realize that you need to do something in the same way as you did in another project. This thing might not be a functionality or a library, it might not be something which you can encode into some clever macro or small crate. Instead, it may be simply a pattern, or a structural concept which addresses a problem nicely.

有时, 您正在处理一个新项目, 并意识到您需要以与在另一个项目中相同的方式执行某些作. 这个东西可能不是一个功能或库, 它可能不是你可以编码到一些聪明的宏或小 crate 中的东西. 相反, 它可能只是一个模式, 或者一个很好地解决了一个问题的结构概念.

One interesting pattern that is commonly applied to problems is that of the 'State Machine'. Let's take some time to consider what exactly we mean when we say that, and why they're interesting.

一个有趣的模式是状态机模式. 让我们花点时间考虑一下我们这么说到底是什么意思, 以及为什么它们很有趣.

> Throughout this post you can run all examples in the playground, I typically use 'Nightly' out of habit.
>
> 在这篇文章中, 你可以在 Rust Playground 中运行所有示例, 我通常出于习惯使用 nightly Rust.

## TOC

## Founding Our Concepts | 概念

There are a lot of resources and topical articles about state machines out there on the internet. Even more so, there are a lot of implementations of state machines.

互联网上有很多关于状态机的资源和主题文章. 更重要的是, 状态机有很多实现.

Just to get to this web page you used one. You can model TCP as a state machine. You can model HTTP requests with one too. You can model any regular language, such as a regex, as a state machine. They're everywhere, hiding inside things we use every day.

只是为了访问这个网页, 你用了一个状态机. 您可以将 TCP 建模为状态机. 您也可以对 HTTP 请求建模为状态机. 您可以将任何常规语言 (例如正则表达式) 建模为状态机. 它们无处不在, 隐藏在我们每天使用的物品中.

So, a State Machine is any 'machine' which has a set of 'states' and 'transitions' defined between them.

因此, **状态机**是任何在概念之间定义了一组 "状态" 和 "转换" 过程的 "机器".

When we talk about a machine we're referring to the abstract concept of something which does something. For example, your 'Hello World!' function is a machine. It is started and eventually outputs what we expect it to. Some model which you use to interact with your database is just the same. We'll regard our most basic machine simply as a struct that can be created and destroyed.

当我们谈论*机器*时, 我们指的是做某事的抽象概念. 例如, 你的 'Hello World!' 函数是一台*机器*. 它被启动并最终输出我们期望的结果. 您用来与数据库交互的某些模型是相同的. 我们将最基本的*机器*简单地视为可以创建和销毁的 struct.

```rust
struct Machine;

fn main() {
  let my_machine = Machine; // Create.
  // `my_machine` is destroyed when it falls out of scope below.
  // `my_machine` 离开作用域即被销毁
}
```

States are a way to reason about where a machine is in its process. For example, we can think about a bottle filling machine as an example. The machine is in a 'waiting' state when it is waiting for a new bottle. Once it detects a bottle it moves to the 'filling' state. Upon detecting the bottle is filled it enters the 'done' state. After the bottle is left the machine we return to the 'waiting' state.

状态是推理机器在其过程中所处位置的一种方式. 例如, 我们可以以瓶子灌装机为例. 机器在等待新瓶子时处于 "等待" 状态. 一旦检测到瓶子, 它就会进入 "充装" 状态. 检测到瓶子已装满后, 它会进入 "完成" 状态. 瓶子离开机器后, 我们返回 "等待" 状态.

A key takeaway here is that none of the states have any information relevant for the other states. The 'filling' state doesn't care how long the 'waiting' state waited. The 'done' state doesn't care about what rate the bottle was filled at. Each state has discrete responsibilities and concerns. The natural way to consider these variants is as an `enum`.

这里的一个关键要点是, 状态间是独立的. "充装" 状态下并不关心 "等待" 状态持续了多长时间. "完成" 状态也不关心瓶子的充装速率. 每个状态都有不同的责任和关注点. 考虑这些变体的自然方法是枚举 (enum).

```rust
enum BottleFillerState {
  Waiting { waiting_time: std::time::Duration },
  Filling { rate: usize },
  Done,
}

struct BottleFiller {
  state: BottleFillerState,
}
```

Using an `enum` in this way means all the states are mutually exclusive, you can only be in one at a time. Rust's 'fat enums' allow us to have each of these states to carry data with them as well. As far as our current definition is concerned, everything is totally okay.

以这种方式使用 `enum` 意味着所有状态都是互斥的, 您一次只能处于一个状态. Rust 的胖 enums 允许我们让这些状态随身携带数据. 就我们目前的定义而言, 一切都完全没问题.

But there is a bit of a problem here. When we described our bottle filling machine above we described three transitions: `Waiting -> Filling`, `Filling -> Done`, and `Done -> Waiting`. We never described `Waiting -> Done` or `Done -> Filling`, those don't make sense!

但这里有一点问题. 当我们在上面描述我们的瓶子灌装机时, 我们描述了三个转换关系: `等待 -> 充装`、`充装 -> 完成`和`完成 -> 等待`. 我们从来没有描述过`等待 -> 完成`或`完成 -> 装`, 这些都没有意义!

This brings us to the idea of transitions. One of the nicest things about a true state machine is we never have to worry about our bottle machine going from Done -> Filling, for example. The state machine pattern should enforce that this can never happen. Ideally this would be done before we even start running our machine, at compile time.

由此引入转换的概念. 例如, 真实状态机最好的一点是, 我们永远不必担心我们的瓶子机会从 `完成 -> 充装` 开始. 状态机模式应该强制要求这种情况永远不会发生. 理想情况下, 这应该在我们开始运行我们的机器之前, 或者说在编译时完成检查.

Let's look again at the transitions we described for our bottle filler in a diagram:

让我们再次看一下我们在图表中为瓶子灌装机描述的过渡:

```plaintext
  +++++++++++   +++++++++++   ++++++++
  |         |   |         |   |      |
  | Waiting +-->+ Filling +-->+ Done |
  |         |   |         |   |      |
  ++++-++++-+   +++++++++++   +--+++++
       ^                         |
       +++++++++++++++++++++++++-+
```

As we can see here there are a finite number of states, and a finite number of transitions between these states. Now, it is possible to have a valid transition between each state and every other state, but in most cases this is not true.

正如我们在这里看到的, 状态的数量是有限的, 这些状态之间的转换数量是有限的. 现在, 每个状态和每个其他状态之间可以有一个有效的转换, 但在大多数情况下, 情况并非如此.

This means moving between a state such as 'Waiting' to a state such as 'Filling' should have defined semantics. In our example this can be defined as "There is a bottle in place." In the case of a TCP stream it might be "We have received a FIN packet" which means we need to finish closing out the stream.

这意味着在状态 (如 "等待") 和状态 (如 "充装") 之间转换时, 应定义语义. 在我们的示例中, 这可以定义为 "瓶子就位". 对于 TCP 流, 它可能是 "收到 FIN", 这意味着我们需要完成关闭流.

## Determining What We Want | 目标

Now that we know what a state machine is, how do we represent them in Rust? First, let's think about what we want from some pattern.

现在我们知道了什么是状态机, 我们如何在 Rust 中表示它们呢? 首先, 让我们考虑一下我们想要从某个模式中得到什么.

Ideally, we'd like to see the following characteristics:

理想情况下, 我们希望看到以下特征:

- Can only be in one state at a time.

  一次只能处于一种状态.

- Each state should have its own associated values if required.

  如果需要, 每个状态都应该有自己的关联值.

- Transitioning between states should have well defined semantics.

  状态之间的转换应该有明确定义的语义.

- It should be possible to have some level of shared state.

  应该可以有一定程度的共享状态.

- Only explicitly defined transitions should be permitted.

  只允许显式定义的过渡.

- Changing from one state to another should consume the state so it can no longer be used.

  从一种状态更改为另一种状态应该会消耗该状态, 因此它不能再被使用.

- We shouldn't need to allocate memory for all states. No more than largest sized state certainly

  我们不需要为所有状态分配内存. 肯定不超过最大的状态(所将占用的).

- Any error messages should be easy to understand.

  任何错误消息都应该易于理解.

- We shouldn't need to resort to heap allocations to do this. Everything should be possible on the stack.

  我们不应求助于堆分配. 尽量在栈上操作.

- The type system should be harnessed to our greatest ability.

  应当充分利用类型系统.

- As many errors as possible should be at compile-time.

  尽量在编译时考虑到错误.

So if we could have a design pattern which allowed for all these things it'd be truly fantastic. Having a pattern which allowed for most would be pretty good too.

因此, 如果我们能有一个允许所有这些事情的设计模式, 那将非常棒. 拥有一个允许大多数人的模式也很好.

## Exploring Possible Implementation Options | 探索

With a type system as powerful and flexible as Rusts we should be able to represent this. The truth is: there are a number of ways to try, each has valuable characteristics, and each teaches us lessons.

有了像 Rust 这样强大和灵活的类型系统, 我们应该能够处理这些要求. 事实是: 有很多方法可以尝试, 每一种都有有价值的特性, 每一种都能给我们带来教训.

### A Second Shot with Enums | 再看看枚举

As we saw above the most natural way to attempt this is an enum, but we noted already that you can't control which transitions are actually permitted in this case. So can we just wrap it? We sure can! Let's take a look:

正如我们在上面看到的, 实现状态机模式的最自然方法是枚举, 但我们已经注意到, 在这种情况下, 您无法控制实际允许的过渡. 那么我们能不能做一些包装呢? 我们当然可以! 让我们来看看:

```rust
enum State {
    Waiting { waiting_time: std::time::Duration },
    Filling { rate: usize },
    Done
}

struct StateMachine { state: State }

impl StateMachine {
    fn new() -> Self {
        StateMachine {
            state: State::Waiting { waiting_time: std::time::Duration::new(0, 0) }
        }
    }
    fn to_filling(&mut self) {
        self.state = match self.state {
            // Only Waiting -> Filling is valid.
            State::Waiting { .. } => State::Filling { rate: 1 },
            // The rest should fail.
            _ => panic!("Invalid state transition!"),
        }
    }
    // ...
}

fn main() {
    let mut state_machine = StateMachine::new();
    state_machine.to_filling();
}
```

At first glance it seems okay. But notice some problems?

乍一看似乎还不错. 但是注意到一些问题了吗?

- Invalid transition errors happen at runtime, which is awful!

  无效的过渡错误发生在运行时, 这太可怕了!

- This only prevents invalid transitions outside of the module, since the private fields can be manipulated freely inside the module. For example, `state_machine.state = State::Done` is perfectly valid inside the module.

 这只能防止 module 之外的无效转换, module 内部是不限制的. 例如,  `state_machine.state = State::Done` 在模块内是完全有效的.

- Every function we implement that works with the state has to include a `match` statement!

  我们实现的每个与 state 一起使用的函数都必须包含一个 `match` 语句!

However this does have some good characteristics:

但是, 这确实具有一些很好的特性:

- The memory required to represent the state machine is only the size of the largest state. This is because a fat enum is only as big as its biggest variant.

  表示状态机的结构大小取决于最大的变体的大小. 这是因为胖枚举的大小取决于其最大的变体.

- Everything happens on the stack.

- 一切都发生在栈上.

- Transitioning between states has well defined semantics... It either works or it crashes!

  状态之间的转换具有明确定义的语义... 要么有效, 要么崩溃!

Now you might be thinking "Hoverbear you could totally wrap the `to_filling()` output with a `Result<T, E>` or have an `InvalidState` variant!" But let's face it: That doesn't make things that much better, if at all. Even if we get rid of the runtime failures we still have to deal with a lot of clumsiness with the `match` statements and our errors would still only be found at runtime! Ugh! We can do better, I promise.

现在你可能会想, "Hoverbear, 你可以完全用 `Result<T, E>` 或有 `InvalidState` 变体来包装 `to_filling()` 输出! 但让我们面对现实吧: 这并没有让事情变得更好, 如果有的话. 即使我们摆脱了运行时的失败, 我们仍然需要处理 `match` 语句的许多笨拙问题, 我们的错误仍然只能在运行时发现! 呸! 我可以做得更好, 我保证.

So let's keep looking!

所以让我们继续寻找吧!

### Structures With Transitions | 带转换的结构体

So what if we just used a set of structs? We could have them all implement traits which all states should share. We could use special functions that transitioned the type into the new type! How would it look?

那么, 如果我们只使用一组结构体呢? 我们可以让它们都实现所有状态都应该共享的特征. 我们可以使用特殊函数将类型转换为新类型! 它会是什么样子?

```rust
// This is some functionality shared by all of the states.
trait SharedFunctionality {
    fn get_shared_value(&self) -> usize;
}

struct Waiting {
    waiting_time: std::time::Duration,
    // Value shared by all states.
    shared_value: usize,
}

impl Waiting {
    fn new() -> Self {
        Waiting {
            waiting_time: std::time::Duration::new(0,0),
            shared_value: 0,
        }
    }

    // Consumes the value!
    fn to_filling(self) -> Filling {
        Filling {
            rate: 1,
            shared_value: 0,
        }
    }
}

impl SharedFunctionality for Waiting {
    fn get_shared_value(&self) -> usize {
        self.shared_value
    }
}

struct Filling {
    rate: usize,
    // Value shared by all states.
    shared_value: usize,
}

impl SharedFunctionality for Filling {
    fn get_shared_value(&self) -> usize {
        self.shared_value
    }
}

// ...

fn main() {
    let in_waiting_state = Waiting::new();
    let in_filling_state = in_waiting_state.to_filling();
}
```

Gosh that's a buncha code! So the idea here was that all states have some common shared values along with their own specialized values. As you can see from the `to_filling()` function we can consume a given 'Waiting' state and transition it into a 'Filling' state. Let's do a little rundown:

天哪, 这真是一大坨代码! 所以这里的想法是, 所有状态都有一些共同的值以及他们自己的特定值. 正如你从 `to_filling()` 函数中看到的, 我们可以消耗掉给定的 "等待" 状态并将其转换为 "充装" 状态. 让我们做一个小概要:

- Transition errors are caught at compile time! For example you can't even create a Filling state accidentally without first starting with a Waiting state. (You could on purpose, but this is beside the matter.)

  在编译时捕获转换错误!例如, 如果不先从 "等待" 状态开始, 你甚至不能意外地创建一个 "充装" 状态.  (你可以故意的, 但这不是问题.)

- Transition enforcement happens everywhere.
    
  转换的强制保证无处不在.

- When a transition between states is made the old value is consumed instead of just modified. We could have done this with the enum example above as well though.

  在状态之间进行转换时, 将消费掉旧值, 而不仅仅是修改. 不过, 我们也可以使用上面的 enum 示例来做到这一点.

- We don't have to `match` all the time.

  我们不必一直 `match`.

- Memory consumption is still lean, at any given time the size is that of the state.

  内存消耗仍然很少, 在任何给定时间, 大小都是状态的大小.

There are some downsides though:

但也有一些缺点:

- There is a bunch of code repetition. You have to implement the same functions and traits for multiple structures.

  有一堆代码重复. 您必须为多个结构实现相同的函数和 trait.

- It's not always clear what values are shared between all states and just one. Updating code later could be a pain due to this.

  并不总是很清楚所有状态和只有一个状态之间共享哪些值. 因此, 稍后更新代码可能会很痛苦.

- Since the size of the state is variable we end up needing to wrap this in an enum as above for it to be usable where the state machine is simply one component of a more complex system. Here's what this could look like:

  由于 state 的大小是可变的, 我们最终需要像上面一样将其包装在 enum 中, 以便在状态机只是更复杂系统的一个组件时可用. 具体情况如下:

```
enum State {
    Waiting(Waiting),
    Filling(Filling),
    Done(Done),
}

fn main() {
    let in_waiting_state = State::Waiting(Waiting::new());
    // This doesn't work since the `Waiting` struct is wrapped! We need to `match` to get it out.
    let in_filling_state = State::Filling(in_waiting_state.to_filling());
}
```

As you can see, this isn't very ergonomic. We're getting closer to what we want though. The idea of moving between distinct types seems to be a good way forward! Before we go try something entirely different though, let's talk about a simple way to change our example that could enlighten further thinking.

如您所见, 这并不是很符合人体工程学. 不过, 我们越来越接近我们想要的. 在不同类型之间移动的想法似乎是一个很好的前进方向! 不过, 在我们尝试完全不同的东西之前, 让我们谈谈一种简单的方法来改变我们的例子, 这可能会启发进一步的思考.

The Rust standard library defines two highly related traits: `From` and `Into` that are extremely useful and worth checking out. An important thing to note is that implementing one of these automatically implements the other. In general implementing From is preferable as it's a bit more flexible. We can implement them very easily for our above example like so:

Rust 标准库定义了两个高度相关的 trait: `From` 和 `Into` , 它们非常有用, 值得一试. 需要注意的重要一点是, 实现其中一个会自动实现另一个. 一般来说, 实现 `From` 是可取的, 因为它更灵活一些. 对于上面的示例, 我们可以很容易地实现它们, 如下所示:

```rust,no_run
// ...
impl From<Waiting> for Filling {
    fn from(val: Waiting) -> Filling {
        Filling {
            rate: 1,
            shared_value: val.shared_value,
        }
    }
}
// ...
```

Not only does this give us a common function for transitioning, but it also is nice to read about in the source code! This reduces mental burden on us and makes it easier for readers to comprehend. Instead of implementing custom functions we're just using a pattern already existing. Building our pattern on top of already existing patterns is a great way forward.

这不仅为我们提供了一个通用的转换函数, 而且在源代码中阅读也很好!这减轻了我们的精神负担, 使读者更容易理解. 我们没有实现自定义函数, 而是使用已经存在的模式. 在现有模式之上构建我们的模式是一种很好的前进方式.

So this is cool, but how do we deal with all this nasty code repetition and the repeating shared_value stuff? Let's explore a bit more!

所以这很酷, 但是我们如何处理所有这些令人讨厌的代码重复和重复的 shared_value 内容呢? 让我们进一步探索一下!

### Generically Sophistication | 通用而精妙的做法

In this adventure we'll combine lessons and ideas from the first two, along with a few new ideas, to get something more satisfying. The core of this is to harness the power of generics. Let's take a look at a fairly bare structure representing this:

在这次冒险中, 我们将结合前两个的经验教训和想法, 以及一些新的想法, 以获得更令人满意的东西. 其核心是利用泛型的强大功能. 让我们看一下表示这一点的相当简单的结构:

```rust
struct BottleFillingMachine<S> {
    shared_value: usize,
    state: S
}

// The following states can be the 'S' in StateMachine<S>

struct Waiting {
    waiting_time: std::time::Duration,
}

struct Filling {
    rate: usize,
}

struct Done;
```

So here we're actually building the state into the type signature of the `BottleFillingMachine` itself. A state machine in the 'Filling' state is BottleFillingMachine<Filling> which is just awesome since it means when we see it as part of an error message or something we know immediately what state the machine is in.

所以在这里, 我们实际上是将状态构建到 `BottleFillingMachine` 本身的类型签名中. 处于充装状态的状态机是 `BottleFillingMachine<Filling>`, 这真是太棒了, 因为这意味着当我们看到它作为错误消息的一部分或内容时, 我们会立即知道机器处于什么状态.

From there we can go ahead and implement From<T> for some of these specific generic variants like so:

从那里, 我们可以继续为其中一些特定的通用变体实现 `From<T>`, 如下所示:

```rust,no_run
impl From<BottleFillingMachine<Waiting>> for BottleFillingMachine<Filling> {
    fn from(val: BottleFillingMachine<Waiting>) -> BottleFillingMachine<Filling> {
        BottleFillingMachine {
            shared_value: val.shared_value,
            state: Filling {
                rate: 1,
            }
        }
    }
}

impl From<BottleFillingMachine<Filling>> for BottleFillingMachine<Done> {
    fn from(val: BottleFillingMachine<Filling>) -> BottleFillingMachine<Done> {
        BottleFillingMachine {
            shared_value: val.shared_value,
            state: Done,
        }
    }
}
```

Defining a starting state for the machine looks like this:

定义计算机的起始状态如下所示:

```rust,no_run
impl BottleFillingMachine<Waiting> {
    fn new(shared_value: usize) -> Self {
        BottleFillingMachine {
            shared_value: shared_value,
            state: Waiting {
                waiting_time: std::time::Duration::new(0, 0),
            }
        }
    }
}
```

So how does it look to change between two states? Like this:

那么, 两个状态之间的变化会是什么样子呢? 喜欢这个:

```rust,no_run
fn main() {
    let in_waiting = BottleFillingMachine::<Waiting>::new(0);
    let in_filling = BottleFillingMachine::<Filling>::from(in_waiting);
}
```

Alternatively if you're doing this inside of a function whose type signature restricts the possible outputs it might look like this:

或者, 如果你在一个类型签名限制了可能输出的函数内部执行此作, 它可能看起来像这样:

```rust,no_run
fn transition_the_states(val: BottleFillingMachine<Waiting>) -> BottleFillingMachine<Filling> {
    val.into() // Nice right?
}
```

What do the compile time error messages look like?
编译时错误消息是什么样的?

```plaintext
error[E0277]: the trait bound `BottleFillingMachine<Done>: std::convert::From<BottleFillingMachine<Waiting>>` is not satisfied
  --> <anon>:50:22
   |
50 |     let in_filling = BottleFillingMachine::<Done>::from(in_waiting);
   |                      ^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = help: the following implementations were found:
   = help:   <BottleFillingMachine<Filling> as std::convert::From<BottleFillingMachine<Waiting>>>
   = help:   <BottleFillingMachine<Done> as std::convert::From<BottleFillingMachine<Filling>>>
   = note: required by `std::convert::From::from`
```

It's pretty clear what's wrong from that. The error message even hints to us some valid transitions!

这很清楚哪里出了问题. 错误消息甚至向我们提示了一些有效的转换!

So what does this scheme give us?

那么这个给我们带来了什么呢?

- Transitions are ensured to be valid at compile time.

  编译时检查确保转换有效.

- The error messages about invalid transitions are very understandable and even list valid options.

  有关无效转换的错误消息很容易理解, 甚至列出了有效的选项.

- We have a 'parent' structure which can have traits and values associated with it that aren't repeated.

  我们有一个父结构, 它可以有与之关联的 trait 和值, 这些 trait 和值不会重复.

- Once a transition is made the old state no longer exists, it is consumed. Indeed, the entire structure is consumed so if there are side effects of the transition on the parent (for example altering the average waiting time) we can't access stale values.

  一旦进行了转换, 旧状态就不再存在, 它将被消耗掉. 事实上, 整个结构都被消耗掉了, 所以如果转换对父级有副作用 (例如改变平均等待时间), 我们就无法访问过时的值.

- Memory consumption is lean and everything is on the stack.

  内存消耗很少, 一切都在栈上.

There are some downsides still:

仍然有一些缺点:

- Our `From<T>` implementations suffer from a fair bit of "type noise". This is a highly minor concern though.
    我们的 From<T> 实现受到相当多的 "类型干扰" 的影响. 不过, 这是一个非常小的问题.

- Each `BottleFillingMachine<S>` has a different size, with our previous example, so we'll need to use an enum. Because of our structure though we can do this in a way that doesn't completely suck.

  每个 `BottleFillingMachine<S>` 都有不同的大小, 就像我们前面的例子一样, 所以我们需要使用一个枚举. 不过, 由于我们的结构, 我们可以以一种不完全糟糕的方式做到这一点.

> You can play with this example [here](https://play.rust-lang.org/?version=stable&mode=debug&edition=2015)
>
> 您可以在[此处](https://play.rust-lang.org/?version=stable&mode=debug&edition=2015)运行示例

## Getting Messy With the Parents | 结合父结构

So how can we have some parent structure hold our state machine without it being a gigantic pain to interact with? Well, this circles us back around to the enum idea we had at first.

那么, 我们如何让一些父结构来支撑我们的状态机, 而不会造成巨大的交互痛苦呢? 好吧, 这让我们回到了我们最初的 enum 想法.

If you recall the primary problem with the enum example above was that we had to deal with no ability to enforce transitions, and the only errors we got were at runtime when we did try.

如果你还记得上面 enum 示例的主要问题是, 我们没有办法做到转换的编译时强制保证, 错误会在运行时抛出.

```rust,no_run
enum BottleFillingMachineWrapper {
    Waiting(BottleFillingMachine<Waiting>),
    Filling(BottleFillingMachine<Filling>),
    Done(BottleFillingMachine<Done>),
}

struct Factory {
    bottle_filling_machine: BottleFillingMachineWrapper,
}

impl Factory {
    fn new() -> Self {
        Factory {
            bottle_filling_machine: BottleFillingMachineWrapper::Waiting(BottleFillingMachine::new(0)),
        }
    }
}
```

At this point your first reaction is likely "Gosh, Hoverbear, look at that awful and long type signature!" You're quite right! Frankly it's rather long, but I picked long, explanatory type names! You'll be able to use all your favorite arcane abbreviations and type aliases in your own code. Have at!

这时你的第一反应可能是"天哪, Hoverbear, 看看那个又糟糕又长的类型签名! 你说得很对! 坦率地说, 它相当长, 但我选择了长长的、解释性的字体名称! 您能够随意在自己的代码中使用所有您最喜欢的晦涩难懂的缩写和类型别名.

```rust,no_run
impl BottleFillingMachineWrapper {
    fn step(mut self) -> Self {
        match self {
            BottleFillingMachineWrapper::Waiting(val) => BottleFillingMachineWrapper::Filling(val.into()),
            BottleFillingMachineWrapper::Filling(val) => BottleFillingMachineWrapper::Done(val.into()),
            BottleFillingMachineWrapper::Done(val) => BottleFillingMachineWrapper::Waiting(val.into()),
        }
    }
}

fn main() {
    let mut the_factory = Factory::new();
    the_factory.bottle_filling_machine = the_factory.bottle_filling_machine.step();
}
```

Again you may notice that this works by consumption not mutation. Using match the way we are above moves val so that it can be used with `.into()` which we've already determined should consume the state. If you'd really like to use mutation you can consider having your states `#[derive(Clone)]` or even `Copy`, but that's your call.

同样, 你可能会注意到, 这是通过消费而不是可变性来实现的. 按照上面的方式使用 match 会移动值, 以便它可以与 `.into()` 一起使用, 我们已经确定应该消耗状态值. 如果你真的想使用可变性, 你可以考虑让你的状态 `#[derive(Clone)]` 甚至 `Copy`, 但那是你的决定.

Despite this being a bit less ergonomic and pleasant to work with than we might want we still get strongly enforced state transitions and all the guarantees that come with them.

这一方面比我们想要的更符合人体工程学和使用起来更舒适, 另一方面我们仍然得到了强烈执行的状态转换和随之而来的所有保证.

One thing you will notice is this scheme does force you to handle all potential states when manipulating the machine, and that makes sense. You are reaching into a structure with a state machine and manipulating it, you need to have defined actions for each state that it is in.

你会注意到的一件事是, 这个方案确实会迫使你在作机器时处理所有潜在的状态, 这是有道理的. 您正在处理代表状态机的结构, 您需要为它所处的每个状态作定义.

Or you can just `panic!()` if that's what you really want. But if you just wanted to `panic!()` then why didn't you just use the first attempt?

或者, 如果这是你真正想要的, 你可以只 `panic!()`. 但是, 如果您只是想 `panic!()`, 那么您为什么不使用前面第一种方法呢?

> You can see a fully worked example of this Factory example [here](https://play.rust-lang.org/?version=stable&mode=debug&edition=2015).
>
> 您可以在[此处](https://play.rust-lang.org/?version=stable&mode=debug&edition=2015)查看此示例的完整代码.

## Worked Examples | 实际示例

This is the kind of thing it's always nice to have some examples for. So below I've put together a couple worked examples with comments for you to explore.

这种事情总是很高兴能有一些例子. 因此, 下面我整理了几个带有注释的工作示例供您探索.

### Three State, Two Transitions | 三种状态, 两种转换

This example is very similar to the Bottle Filling Machine above, but instead it actually does work, albeit trivial work. It takes a string and returns the number of words in it.

这个例子与上面的瓶子灌装机非常相似, 但它实际上确实有效, 尽管工作微不足道. 它接受一个字符串并返回其中的单词数.

```rust
fn main() {
    // The `<StateA>` is implied here. We don't need to add type annotations!
    let in_state_a = StateMachine::new("Blah blah blah".into());

    // This is okay here. But later once we've changed state it won't work anymore.
    in_state_a.some_unrelated_value;
    println!("Starting Value: {}", in_state_a.state.start_value);


    // Transition to the new state. This consumes the old state.
    // Here we need type annotations (since not all StateMachines are linear in their state).
    let in_state_b = StateMachine::<StateB>::from(in_state_a);

    // This doesn't work! The value is moved when we transition!
    // in_state_a.some_unrelated_value;
    // Instead, we can use the existing value.
    in_state_b.some_unrelated_value;

    println!("Interm Value: {:?}", in_state_b.state.interm_value);

    // And our final state.
    let in_state_c = StateMachine::<StateC>::from(in_state_b);

    // This doesn't work either! The state doesn't even contain this value.
    // in_state_c.state.start_value;

    println!("Final state: {}", in_state_c.state.final_value);
}

// Here is our pretty state machine.
struct StateMachine<S> {
    some_unrelated_value: usize,
    state: S,
}

// It starts, predictably, in `StateA`
impl StateMachine<StateA> {
    fn new(val: String) -> Self {
        StateMachine {
            some_unrelated_value: 0,
            state: StateA::new(val)
        }
    }
}

// State A starts the machine with a string.
struct StateA {
    start_value: String,
}
impl StateA {
    fn new(start_value: String) -> Self {
        StateA {
            start_value: start_value,
        }
    }
}

// State B goes and breaks up that String into words.
struct StateB {
    interm_value: Vec<String>,
}
impl From<StateMachine<StateA>> for StateMachine<StateB> {
    fn from(val: StateMachine<StateA>) -> StateMachine<StateB> {
        StateMachine {
            some_unrelated_value: val.some_unrelated_value,
            state: StateB {
                interm_value: val.state.start_value.split(" ").map(|x| x.into()).collect(),
            }
        }
    }
}

// Finally, StateC gives us the length of the vector, or the word count.
struct StateC {
    final_value: usize,
}
impl From<StateMachine<StateB>> for StateMachine<StateC> {
    fn from(val: StateMachine<StateB>) -> StateMachine<StateC> {
        StateMachine {
            some_unrelated_value: val.some_unrelated_value,
            state: StateC {
                final_value: val.state.interm_value.len(),
            }
        }
    }
}
```

### A Raft Example | Raft 算法示例

If you've followed my posts for awhile you may know I rather enjoy thinking about Raft. Raft, and a discussion with @argorak were the primary motivators behind all of this research.

如果你关注我的帖子有一段时间了, 你可能会知道我更喜欢思考 Raft 算法. Raft 算法以及与 @argorak 的讨论是所有这些研究背后的主要动机.

Raft is a bit more complex than the above examples as it does not just have linear states where A->B->C. Here is the transition diagram:

Raft 算法比上面的例子要复杂一些, 因为它不仅具有 A->B->C 的线性状态. 这是转换图:

```plaintext
++++++++++-+    ++++++++++--+    +++++++--+
|          ++++->           |    |        |
| Follower |    | Candidate ++++-> Leader |
|          <+++-+           |    |        |
+++++++--^-+    ++++++++++--+    +-++++++++
         |                         |
         +++++++++++++++++++++++++-+
```

```rust
// You can play around in this function.
fn main() {
    let is_follower = Raft::new(/* ... */);
    // Raft typically comes in groups of 3, 5, or 7. Just 1 for us. :)

    // Simulate this node timing out first.
    let is_candidate = Raft::<Candidate>::from(is_follower);

    // It wins! How unexpected.
    let is_leader = Raft::<Leader>::from(is_candidate);

    // Then it fails and rejoins later, becoming a Follower again.
    let is_follower_again = Raft::<Follower>::from(is_leader);

    // And goes up for election...
    let is_candidate_again = Raft::<Candidate>::from(is_follower_again);

    // But this time it fails!
    let is_follower_another_time = Raft::<Follower>::from(is_candidate_again);
}


// This is our state machine.
struct Raft<S> {
    // ... Shared Values
    state: S
}

// The three cluster states a Raft node can be in

// If the node is the Leader of the cluster services requests and replicates its state.
struct Leader {
    // ... Specific State Values
}

// If it is a Candidate it is attempting to become a leader due to timeout or initialization.
struct Candidate {
    // ... Specific State Values
}

// Otherwise the node is a follower and is replicating state it receives.
struct Follower {
    // ... Specific State Values
}

// Raft starts in the Follower state
impl Raft<Follower> {
    fn new(/* ... */) -> Self {
        // ...
        Raft {
            // ...
            state: Follower { /* ... */ }
        }
    }
}

// The following are the defined transitions between states.

// When a follower timeout triggers it begins to campaign
impl From<Raft<Follower>> for Raft<Candidate> {
    fn from(val: Raft<Follower>) -> Raft<Candidate> {
        // ... Logic prior to transition
        Raft {
            // ... attr: val.attr
            state: Candidate { /* ... */ }
        }
    }
}

// If it doesn't receive a majority of votes it loses and becomes a follower again.
impl From<Raft<Candidate>> for Raft<Follower> {
    fn from(val: Raft<Candidate>) -> Raft<Follower> {
        // ... Logic prior to transition
        Raft {
            // ... attr: val.attr
            state: Follower { /* ... */ }
        }
    }
}

// If it wins it becomes the leader.
impl From<Raft<Candidate>> for Raft<Leader> {
    fn from(val: Raft<Candidate>) -> Raft<Leader> {
        // ... Logic prior to transition
        Raft {
            // ... attr: val.attr
            state: Leader { /* ... */ }
        }
    }
}

// If the leader becomes disconnected it may rejoin to discover it is no longer leader
impl From<Raft<Leader>> for Raft<Follower> {
    fn from(val: Raft<Leader>) -> Raft<Follower> {
        // ... Logic prior to transition
        Raft {
            // ... attr: val.attr
            state: Follower { /* ... */ }
        }
    }
}
```

## Alternatives From Feedback | 社区备选方案

I saw an interesting comment by I-impv on Reddit showing off this approach based on our examples above. Here's what they had to say about it:

我在 Reddit 上看到了 I-impv 的一条有趣的评论, 它根据我们上面的示例展示了这种方法. 以下是他们对此的看法:

> I like the way you did it. I am working on a fairly complex FSM myself currently and did it slightly different.
>
> 我喜欢你这样做的方式. 我自己目前正在研究一个相当复杂的 FSM, 并且做得略有不同.
>
> Some things I did different:
>
> 我做的一些事情有所不同:
>
> - I also modeled the input for the state machine. That way you can model your transitions as a match over (State, Event) every invalid combination is handled by the 'default' pattern
>
>   我还对状态机的输入进行了建模. 这样, 你可以将转换建模为对 (state, event) 执行匹配, 每个无效的组合都由默认模式处理.
> - Instead of using `panic` for invalid transitions I used a `Failure` state, So every invalid combination transitions to that `Failure` state
>
>   我没有对无效的转换使用 `panic`, 而是使用了 `Failure` 状态, 所以每个无效的组合都会转换到那个 `Failure` 状态.

I really like the idea of modeling the input in the transitions!

我真的很喜欢在过渡中对输入进行建模的想法!

## Closing Thoughts | 结束语

Rust lets us represent State Machines in a fairly good way. In an ideal situation we'd be able to make enums with restricted transitions between variants, but that's not the case. Instead, we can harness the power of generics and the ownership system to create something expressive, safe, and understandable.

Rust 让我们以一种相当好的方式表示状态机. 在理想情况下, 我们能够构建枚举在变体之间执行受限转换, 但事实并非如此. 相反, 我们可以利用泛型和所有权系统的力量来创建富有表现力、安全和可理解的东西.

If you have any feedback or suggestions on this article I'd suggest checking out the footer of this page for contact details. I also hang out on Mozilla's IRC as Hoverbear.

如果您对本文有任何反馈或建议, 我建议您查看此页面的页脚以获取联系方式. 我还以 Hoverbear 的身份在 Mozilla 的 IRC 上闲逛.
