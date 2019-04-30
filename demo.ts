import CQHttp from './mod.ts';

const bot = new CQHttp();

bot.on('message', e => {
  console.log('message', e);
});

bot.on('message.private', async e => {
  console.log('message.private', e);
  await bot.send_private_msg({
    user_id: 123,
  });
  console.log('send private msg');
});


