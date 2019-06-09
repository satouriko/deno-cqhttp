# deno-cqhttp

一个简单的 [CoolQ-HTTP-API](https://cqhttp.cc) 插件的 [Deno](https://deno.land/) SDK。

## 关于 Deno

[Node 的设计缺陷和 Deno 的起源](https://tinyclouds.org/jsconf2018.pdf)

[Deno 简介](https://deno.land/manual.html#introduction)

[Deno 安装指南](https://deno.land/manual.html#setup)

**注意！**

> Deno is very much under development. We encourage brave early adopters, but expect bugs large and small. The API is subject to change without notice. 

Deno 现在还处于不稳定阶段，内置 API 和标准库都随时可能会变动，
因此本项目可能会处于用不了了的状态。
如果你发现它用不了，请 [通知](https://github.com/nenojs/deno-cqhttp/issues/new) 我。

但是不用担心，Deno 有缓存远程代码的特性，
所以只要你第一次能用，它就会一直能用，直到你指定 `--reload` 参数为止。

> Remote code is fetched and cached on first execution, and never updated until the code is run with the --reload flag.

## 通信方式

这个 SDK 只支持 **反向 WebSocket** 作为通信方式。

[如何配置通信方式](https://cqhttp.cc/docs/#/Configuration)

[各种通信方式说明](https://cqhttp.cc/docs/#/CommunicationMethods)

## 运行示例

示例程序在 [demo.ts](https://github.com/nenojs/deno-cqhttp/blob/master/demo.ts)，你可以直接用下面这个命令运行。

```bash
deno run https://raw.githubusercontent.com/nenojs/deno-cqhttp/master/demo.ts
```

## 教程

### 创建实例

```typescript
const bot = new CQHttp();
```

可以传入 [access_token](https://cqhttp.cc/docs/#/CommunicationMethods), 用来在建立连接的时候确保是来自 CQHttp 的连接（CQHttp 方面也需要配置）。

```typescript
const bot = new CQHttp({ access_token: 'あなたのその 全てが欲し 欲しくて震えてる' });
```

你可以配置路由地址来重载默认的地址，具体说明见 [CQHttp 文档](https://cqhttp.cc/docs/#/CommunicationMethods)：

```typescript
const bot = new CQHttp({
  ws_reverse_url: '/ws/',
  ws_reverse_api_url: '/ws/api/',
  ws_reverse_event_url: '/ws/event/',
});
```

### 监听事件

监听事件：

```typescript
bot.on('message', handler);
```

只监听一次：

```typescript
bot.once('message', handler);
```

取消监听：

```typescript
bot.off('message', handler);
```

### Socket 事件

WebSocket 连接和关闭时会分别发出 `socket.connect` 和 `socket.close` 事件。

事件对象中包含 `role` 字段，表示连接的类型（`api`，`event` 或 `universal`）。
`self_id` 字段，表示当前账号的 QQ 号。

### CQHttp 事件

所有 CQHttp 上报的 [事件](https://cqhttp.cc/docs/#/Post?id=事件列表) 都可以监听，事件名称为 `{post_type}.{detail_type}.{sub_type}`。

例如，`post_type` 为 `message`，`message_type` 为 `private`，`sub_type` 为 `friend` 时，
会逐级触发 `message.private.friend`、`message.private`、`message` 事件。

所有 CQHttp 事件会给 handler 的第二个参数传入一个异步回调函数，使用它可以对事件 [快速响应](https://cqhttp.cc/docs/#/API?id=-handle_quick_operation-对事件执行快速操作)。

例如:

```typescript
bot.on('message.group', async (e, op) => {
  if (e.raw_message.indexOf('艹') !== -1) {
    await op({
      ban: true,
      reply: '请不要说脏话',
    });
  }
})
```

### 调用 API

调用 API 直接使用 [CQHttp API 列表](https://cqhttp.cc/docs/#/API?id=api-列表) 中的 API 作为方法名即可，例如：

```typescript
await bot.send_private_msg({
  user_id: 615050000,
  message: '企鹅企鹅，我是人类',
});
```

### 启动 Bot

不要忘了启动，这样才运行了 WebSocket 服务端。

```typescript
bot.listen('0.0.0.0', 8080);
```

## API 参考

虽然本模块是 TypeScript 写的，但由于 Deno 生态还没有发展起来，
你可能暂时无法利用 IDE 的提示、补全和声明跳转。

你可以查阅 [源代码](https://github.com/nenojs/deno-cqhttp/blob/master/mod.ts) 作参考。
