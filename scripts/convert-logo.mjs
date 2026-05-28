import sharp from 'sharp';

const input  = 'public/aju-alliance-logo.jpg';
const output = 'public/aju-alliance-logo.png';

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const pixels = new Uint8Array(data);

// 흰 배경 제거 + 어두운 픽셀 → 흰색으로 (다크 배경에서 가시성 확보)
for (let i = 0; i < pixels.length; i += channels) {
  const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
  if (r > 200 && g > 200 && b > 200) {
    // 밝은 픽셀 → 투명 (흰 배경 제거)
    pixels[i + 3] = 0;
  } else {
    // 어두운 픽셀 (글자·아이콘) → 흰색으로 변환
    pixels[i]     = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = 255;
  }
}

await sharp(Buffer.from(pixels), { raw: { width, height, channels } })
  .png()
  .toFile(output);

console.log(`✅ 변환 완료: ${output}`);
