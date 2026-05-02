import axios from 'axios';

const token = process.env.TELEGRAM_TOKEN;
const url = process.env.WEBHOOK_URL;
if (!token || !url) {
  console.error('Set TELEGRAM_TOKEN and WEBHOOK_URL');
  process.exit(1);
}

(async () => {
  const r = await axios.get(`https://api.telegram.org/bot${token}/setWebhook`, { params: { url } });
  console.log(r.data);
})();
