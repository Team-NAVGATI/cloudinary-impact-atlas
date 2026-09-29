import { v2 as cloudinary } from 'cloudinary';

async function test() {
  const cloud_name = 'kcctha50';
  const api_key = '917946311587874';
  const api_secret = 'Tqyc7NFAid2uEpk2o4IXOpwSvkI';

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'organizations/test/media';
  const public_id = 'asset_test_' + Date.now();

  const paramsToSign = { folder, public_id, timestamp };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, api_secret);

  const fd = new FormData();
  const blob = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
  fd.append('file', blob, 'pixel.png');
  fd.append('api_key', api_key);
  fd.append('timestamp', timestamp.toString());
  fd.append('signature', signature);
  fd.append('folder', folder);
  fd.append('public_id', public_id);

  console.log('Sending upload to Cloudinary...');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`, {
    method: 'POST',
    body: fd
  });
  const text = await res.text();
  console.log('HTTP Status:', res.status);
  console.log('Cloudinary Response:', text);
}
test().catch(console.error);
