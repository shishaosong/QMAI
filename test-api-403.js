// 测试不同 headers 组合找出 403 的原�?
const API_KEY = process.env.LINUX_DO_API_KEY || "";
const BASE_URL = "https://hub.linux.do/v1";

if (!API_KEY) {
  throw new Error("Set LINUX_DO_API_KEY before running this script.");
}

async function testWithHeaders(testName, headers) {
  console.log(`\n=== ${testName} ===`);
  const url = `${BASE_URL}/models`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers
    });

    console.log(`状态码: ${response.status} ${response.statusText}`);

    if (response.status === 403) {
      const text = await response.text();
      console.log(`403 响应: ${text.substring(0, 200)}`);
    } else if (response.ok) {
      console.log("�?成功");
    }

    return response.status;
  } catch (error) {
    console.error(`�?错误: ${error.message}`);
    return -1;
  }
}

async function runTests() {
  // 测试 1: 只有 Authorization
  await testWithHeaders("测试1: 只有 Authorization", {
    "Authorization": `Bearer ${API_KEY}`
  });

  // 测试 2: Authorization + Content-Type
  await testWithHeaders("测试2: Authorization + Content-Type", {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  });

  // 测试 3: Authorization + Origin: 空字符串 (模拟软件中的行为)
  await testWithHeaders("测试3: Authorization + Origin: �?, {
    "Authorization": `Bearer ${API_KEY}`,
    "Origin": ""
  });

  // 测试 4: Authorization + Origin: http://localhost
  await testWithHeaders("测试4: Authorization + Origin: localhost", {
    "Authorization": `Bearer ${API_KEY}`,
    "Origin": "http://localhost"
  });

  // 测试 5: Authorization + Content-Type + Origin: �?
  await testWithHeaders("测试5: Authorization + Content-Type + Origin: �?, {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "Origin": ""
  });

  // 测试 6: 模拟软件 withCustomOriginHeader 的输�?
  await testWithHeaders("测试6: 模拟软件�?headers (非本地端�?", {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`,
    "Origin": ""  // 这是软件中对非本地端点设置的
  });

  // 测试 7: 不设�?Origin
  await testWithHeaders("测试7: 不设�?Origin", {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_KEY}`
  });

  // 测试 8: 删除 Content-Type
  await testWithHeaders("测试8: 只有 Authorization + 兼容 headers", {
    "Authorization": `Bearer ${API_KEY}`,
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) QMaiWrite"
  });
}

runTests();
