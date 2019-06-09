import CQHttp from './mod.ts';

const bot = new CQHttp();

bot.on('socket', e => {
  console.log('socket event', e);
});

bot.on('message', e => {
  console.log('message', e);
});

bot.on('message.private', async (e, op) => {
  console.log('message.private', e);
  await op({ reply: '收到' });
  let resp;
  try {
    resp = await bot.send_private_msg({
      user_id: e.user_id,
      message: e.message,
    });
    console.log('sent private msg', resp);
  } catch (e) {
    console.error(e);
    return;
  }
  setTimeout(async () => {
    try {
      resp = await bot.delete_msg({
        message_id: resp.message_id,
      });
      console.log('withdraw private msg', resp);
    } catch (e) {
      console.error(e);
    }
  }, 5000);
});

bot.listen('0.0.0.0', 8080);
