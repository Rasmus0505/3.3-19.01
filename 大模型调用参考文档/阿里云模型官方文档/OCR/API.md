千问OCR 是专用于文字提取的视觉理解模型，可从各类图像（如扫描文档、表格、票据等）中提取文本或解析结构化数据，支持识别多种语言，并能通过特定任务指令实现信息抽取、表格解析、公式识别等高级功能。

**支持的地域：**华北2（北京）、新加坡和美国（弗吉尼亚），需使用各地域的 [API Key](https://help.aliyun.com/zh/model-studio/get-api-key)和 [请求地址](https://help.aliyun.com/zh/model-studio/regions/#e099c3027aul9)。

**在线体验：**访问[阿里云百炼控制台](https://bailian.console.aliyun.com/cn-beijing?spm=5176.29619931.J__Z58Z6CX7MY__Ll8p1ZOR.1.7dd7521cmX1pAh&tab=model#/model-market)，在页面右上角选择目标地域，进入[视觉模型](https://bailian.console.aliyun.com/#/efm/model_experience_center/vision)页面选择千问OCR 模型进行体验。

## **效果示例**

| **输入图像** | **识别结果** |
| --- | --- |
| **识别多种语言** ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5727078571/p1008252.png) | `INTERNATIONAL` `MOTHER LANGUAGE` `DAY` `Привет!` `你好!` `Bonjour!` `Merhaba!` `Ciao!` `Hello!` `Ola!` `בר מולד` `Salam!` |
| **识别倾斜图像** ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5727078571/p1006562.png) | 产品介绍 本品采用韩国进口纤维丝制造，不缩水、不变形、不发霉、不生菌、不伤物品表面。具有真正的不粘油、吸水力强、耐水浸、清洗干净、无毒、无残留、易晾干等特点。 店家使用经验：不锈钢、陶瓷制品、浴盆、整体浴室大部分是白色的光洁表面，用其他的抹布擦洗表面污渍不易洗掉，太尖的容易划出划痕。使用这个仿真丝瓜布，沾少量中性洗涤剂揉出泡沫，很容易把这些表面污渍擦洗干净。 6941990612023 货号：2023 |
| **定位文字位置** ![img_1](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5727078571/p1006591.png) > [高精识别](#bc50e150edeku)任务支持文字定位功能。 | **可视化定位效果** ![img_1_location](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/5727078571/p1006592.png) > 可参见[常见问题](#1b2f34fa43blq)将每行文本的边界框绘制到原图上。 |

## **支持的模型**

### **中国内地**

在[中国内地部署模式](https://help.aliyun.com/zh/model-studio/regions/#080da663a75xh)下，接入点与数据存储均位于**北京地域**，模型推理计算资源仅限于中国内地。

| **模型名称** | **版本** | **上下文长度** | **最大输入** | **最大输出** | **输入单价** | **输出单价** | **免费额度** [（注）](https://help.aliyun.com/zh/model-studio/new-free-quota#591f3dfedfyzj) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **（Token数）** |   |   | **（每百万Token）** |   |
| **qwen-vl-ocr** > 当前与qwen-vl-ocr-2025-11-20能力相同 > [Batch 调用](https://help.aliyun.com/zh/model-studio/batch-interfaces-compatible-with-openai/)半价 | 稳定版 | 38,192 | 30,000 > 单图最大30000 | 8,192 | 0.3元 | 0.5元 | 各100万Token 有效期：百炼开通后90天内 |
| **qwen-vl-ocr-latest** > 始终与最新版能力相同 > [Batch 调用](https://help.aliyun.com/zh/model-studio/batch-interfaces-compatible-with-openai/)半价 | 最新版 |
| qwen-vl-ocr-2025-11-20 > 基于Qwen3-VL架构，大幅提升文档解析、文字定位能力。 | 快照版 |
| qwen-vl-ocr-2025-08-28 > 又称qwen-vl-ocr-0828 | 34,096 | 4,096 | 5元  | 5元  |
| qwen-vl-ocr-2025-04-13 > 又称qwen-vl-ocr-0413 |
| qwen-vl-ocr-2024-10-28 > 又称qwen-vl-ocr-1028 |

### 全球

在[全球部署模式](https://help.aliyun.com/zh/model-studio/regions/#080da663a75xh)下，接入点与数据存储均位于**美国（弗吉尼亚）****地域**，模型推理计算资源在全球范围内动态调度。

| **模型名称** | **版本** | **上下文长度** | **最大输入** | **最大输出** | **输入单价** | **输出单价** | **免费额度** [（注）](https://help.aliyun.com/zh/model-studio/new-free-quota#591f3dfedfyzj) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **（Token数）** |   |   | **（每百万Token）** |   |
| **qwen-vl-ocr** > 当前与qwen-vl-ocr-2025-11-20能力相同 | 稳定版 | 38,192 | 30,000 > 单图最大30000 | 8,192 | 0.3元 | 0.5元 | 无免费额度 |
| qwen-vl-ocr-2025-11-20 > 又称qwen-vl-ocr-1120 > 基于Qwen3-VL架构，大幅提升文档解析、文字定位能力。 | 快照版 |

### 国际

在[国际部署模式](https://help.aliyun.com/zh/model-studio/regions/#080da663a75xh)下，接入点与数据存储均位于**新加坡地域**，模型推理计算资源在全球范围内动态调度（不含中国内地）。

| **模型名称** | **版本** | **上下文长度** | **最大输入** | **最大输出** | **输入单价** | **输出单价** | **免费额度** [（注）](https://help.aliyun.com/zh/model-studio/new-free-quota#591f3dfedfyzj) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **（Token数）** |   |   | **（每百万Token）** |   |
| **qwen-vl-ocr** > 当前与qwen-vl-ocr-2025-11-20能力相同 | 稳定版 | 38,192 | 30,000 > 单图最大30000 | 8,192 | 0.514元 | 1.174元 | 无免费额度 |
| qwen-vl-ocr-2025-11-20 > 又称qwen-vl-ocr-1120 > 基于Qwen3-VL架构，大幅提升文档解析、文字定位能力。 | 快照版 |

> `qwen-vl-ocr、qwen-vl-ocr-2025-04-13、qwen-vl-ocr-2025-08-28`模型，`max_tokens`参数（最大输出长度）默认为 4096，如需提高该参数值（4097~8192范围），请发送邮件至 [modelstudio@service.aliyun.com](mailto:modelstudio@service.aliyun.com)进行申请，并提供以下信息：主账号ID、图像类型（如文档图、电商图、合同等）、模型名称、预计 QPS 和每日请求总数，以及模型输出长度超过4096的请求占比。

**手动估算图像 Token 的示例代码（仅供预算参考）**

计算公式：图像 Token 数 = `(h_bar * w_bar) / token_pixels + 2`。

-   `h_bar * w_bar`表示缩放后的图像长宽，模型在处理图像前会进行预处理，将其缩放至特定像素上限内，像素上限与`max_pixels`参数的取值有关。
    
-   `token_pixels`表示每`Token`对应的像素值
    
    -   `qwen-vl-ocr`、`qwen-vl-ocr-2025-11-20`、`qwen-vl-ocr-latest`固定为`32*32`（即`1024`）
        
    -   其他模型固定为`28*28`（即`784`）。
        

以下代码演示了模型内部对图像的大致缩放逻辑，可用于估算一张图像的Token，实际计费请以 API 响应为准。

```
import math
from PIL import Image

def smart_resize(image_path, min_pixels, max_pixels):
    """
    对图像进行预处理。

    参数:
        image_path：图像的路径
    """
    # 打开指定的PNG图片文件
    image = Image.open(image_path)

    # 获取图片的原始尺寸
    height = image.height
    width = image.width
    # 将高度调整为28或32的整数倍
    h_bar = round(height / 32) * 32
    # 将宽度调整为28或32的整数倍
    w_bar = round(width / 32) * 32

    # 对图像进行缩放处理，调整像素的总数在范围[min_pixels,max_pixels]内
    if h_bar * w_bar > max_pixels:
        beta = math.sqrt((height * width) / max_pixels)
        h_bar = math.floor(height / beta / 32) * 32
        w_bar = math.floor(width / beta / 32) * 32
    elif h_bar * w_bar < min_pixels:
        beta = math.sqrt(min_pixels / (height * width))
        h_bar = math.ceil(height * beta / 32) * 32
        w_bar = math.ceil(width * beta / 32) * 32
    return h_bar, w_bar


# 将xxx/test.png替换为您本地的图像路径
h_bar, w_bar = smart_resize("xxx/test.png", min_pixels=32 * 32 * 3, max_pixels=8192 * 32 * 32)
print(f"缩放后的图像尺寸为：高度为{h_bar}，宽度为{w_bar}")

# 计算图像的Token数：总像素除以32 * 32
token = int((h_bar * w_bar) / (32 * 32))

# <|vision_bos|> 和 <|vision_eos|> 作为视觉标记，每个需计入 1个Token
print(f"图像的总Token数为{token + 2}")
```

## **准备工作**

-   [已配置 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)并[配置API Key到环境变量](https://help.aliyun.com/zh/model-studio/configure-api-key-through-environment-variables)。
    
-   如果通过 OpenAI SDK 或 DashScope SDK进行调用，请先安装[最新版 SDK](https://help.aliyun.com/zh/model-studio/install-sdk)。DashScope Python SDK 最低版本为1.22.2， Java SDK 最低版本为2.21.8。
    
    -   **DashScope SDK**
        
        -   **优势**：支持所有高级特性，如图像旋转矫正和内置 OCR 任务。功能更完整，调用方式更简洁。
            
        -   **适用场景**：需要使用完整功能的项目。
            
    -   **OpenAI 兼容 SDK**
        
        -   **优势**：方便已使用 OpenAI SDK 或生态工具的用户快速迁移。
            
        -   **限制**：高级功能（图像旋转矫正和内置 OCR 任务）不支持直接通过参数调用，需要通过构造复杂的 Prompt 手动模拟，输出结果需要自行解析。
            
        -   **适用场景**：已有 OpenAI 集成基础，且不依赖 DashScope 独有高级功能的项目。
            

## **快速开始**

以下示例将从[火车票图片（URL）](https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg)中提取关键信息，并以 JSON 格式返回。了解[如何传入本地文件](https://help.aliyun.com/zh/model-studio/vision#d987f8de5395x)和[图像限制](https://help.aliyun.com/zh/model-studio/vision#da33480805fjh)。

## OpenAI 兼容

## Python

```
from openai import OpenAI
import os

PROMPT_TICKET_EXTRACTION = """
请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。
要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。
返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"},
"""

try:
    client = OpenAI(
        # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx" 
        # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
        api_key=os.getenv("DASHSCOPE_API_KEY"),
        # 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
        # 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    completion = client.chat.completions.create(
        model="qwen-vl-ocr-latest",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url":"https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg"},
                        # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                        "min_pixels": 32 * 32 * 3,
                        # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                        "max_pixels": 32 * 32 * 8192
                    },
                    # 模型支持在text字段中传入Prompt，若未传入，则会使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.    
                    {"type": "text",
                     "text": PROMPT_TICKET_EXTRACTION}
                ]
            }
        ])
    print(completion.choices[0].message.content)
except Exception as e:
    print(f"错误信息: {e}")
```

## Node.js

```
import OpenAI from 'openai';

// 定义提取车票信息的Prompt
const PROMPT_TICKET_EXTRACTION = `
请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。
要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。
返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"}
`;

// 初始化OpenAI客户端
const client = new OpenAI({
    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
   // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    apiKey: process.env.DASHSCOPE_API_KEY,
  // 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
  // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

async function main() {
    try {
        // 创建聊天完成请求
        const completion = await client.chat.completions.create({
            model: "qwen-vl-ocr-latest",
            messages: [
                {
                    role: "user",
                    content: [
                        // 模型支持在text字段中传入Prompt，若未传入，则会使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg",
                            },
                            // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                            min_pixels: 32 * 32 * 3,
                            // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                            max_pixels: 32 * 32 * 8192
                        },
                        {type: "text",
                         text: PROMPT_TICKET_EXTRACTION}
                    ]
                }
            ]
        });

        // 输出结果
        console.log(completion.choices[0].message.content);
    } catch (error) {
        console.log(`错误信息: ${error}`);
    }
}

main();
```

## curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
# === 执行时请删除该注释 ===

curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-vl-ocr-latest",
  "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url":"https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg"},
                    "min_pixels": 3072,
                    "max_pixels": 8388608
                },
                {"type": "text", "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"}
            ]
        }
    ]
}'
```

#### **响应示例**

```
{
  "choices": [{
    "message": {
      "content": "```json\n{\n    \"发票号码\": \"24329116804000\",\n    \"车次\": \"G1948\",\n    \"起始站\": \"南京南站\",\n    \"终点站\": \"郑州东站\",\n    \"发车日期和时间点\": \"2024年11月14日11:46开\",\n    \"座位号\": \"04车12A号\",\n    \"席别类型\": \"二等座\",\n    \"票价\": \"￥337.50\",\n    \"身份证号码\": \"4107281991****5515\",\n    \"购票人姓名\": \"读小光\"\n}\n```",
      "role": "assistant"
    },
    "finish_reason": "stop",
    "index": 0,
    "logprobs": null
  }],
  "object": "chat.completion",
  "usage": {
    "prompt_tokens": 606,
    "completion_tokens": 159,
    "total_tokens": 765
  },
  "created": 1742528311,
  "system_fingerprint": null,
  "model": "qwen-vl-ocr-latest",
  "id": "chatcmpl-20e5d9ed-e8a3-947d-bebb-c47ef1378598"
}
```

## DashScope

## Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

PROMPT_TICKET_EXTRACTION = """
请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。
要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。
返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"},
"""

try:
    response = dashscope.MultiModalConversation.call(
        model='qwen-vl-ocr-latest',
        # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
        # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
        api_key=os.getenv('DASHSCOPE_API_KEY'),
        messages=[{
            'role': 'user',
            'content': [
                {'image': 'https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg',
                 # 输入图像的最小像素阈值，小于该值图像会放大，直到总像素大于min_pixels
                 "min_pixels": 32 * 32 * 3,
                 # 输入图像的最大像素阈值，超过该值图像会缩小，直到总像素低于max_pixels
                 "max_pixels": 32 * 32 * 8192,
                 # 是否开启图像自动转正功能
                 "enable_rotate": False,
                },
                # 未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                {'text': PROMPT_TICKET_EXTRACTION}
            ]
        }]
    )
    print(response.output.choices[0].message.content[0]['text'])
except Exception as e:
    print(f"An error occurred: {e}")
```

## Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 开启图像自动转正功能
        map.put("enable_rotate", false);
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map,
                        // 未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                        Collections.singletonMap("text", "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'\
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"\
  --header 'Content-Type: application/json'\
  --data '{
"model": "qwen-vl-ocr-latest",
"input": {
  "messages": [
    {
      "role": "user",
      "content": [{
          "image": "https://img.alicdn.com/imgextra/i2/O1CN01ktT8451iQutqReELT_!!6000000004408-0-tps-689-487.jpg",
          "min_pixels": 3072,
          "max_pixels": 8388608,
          "enable_rotate": false
        },
        {
          "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"
        }
      ]
    }
  ]
}
}'
```

**响应示例**

```
{
  "output": {
    "choices": [{
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": [{
          "text": "```json\n{\n    \"发票号码\": \"24329116804000\",\n    \"车次\": \"G1948\",\n    \"起始站\": \"南京南站\",\n    \"终点站\": \"郑州东站\",\n    \"发车日期和时间点\": \"2024年11月14日11:46开\",\n    \"座位号\": \"04车12A号\",\n    \"席别类型\": \"二等座\",\n    \"票价\": \"￥337.50\",\n    \"身份证号码\": \"4107281991****5515\",\n    \"购票人姓名\": \"读小光\"\n}\n```"
        }]
      }
    }]
  },
  "usage": {
    "total_tokens": 765,
    "output_tokens": 159,
    "input_tokens": 606,
    "image_tokens": 427
  },
  "request_id": "b3ca3bbb-2bdd-9367-90bd-f3f39e480db0"
}
```

## **调用内置任务**

为简化特定场景下的调用，模型（除`qwen-vl-ocr-2024-10-28`外）内置了多种任务。

**使用方法**：

-   **Dashscope SDK**：您无需设计和传入`Prompt`，模型内部会采用固定的`Prompt`，设置 `ocr_options` 参数即可调用内置任务。
    
-   **OpenAI 兼容 SDK：**您需手动填写任务指定的`Prompt`。
    

下表列出了各内置任务对应的`task`的取值、指定的`Prompt`、输出格式与示例：

## 高精识别

建议优先使用`qwen-vl-ocr-2025-08-28`以后更新的或最新版模型调用高精识别任务，该任务具有以下特性：

-   识别文本内容（提取文字）
    
-   检测文本位置（定位文本行、输出坐标）
    

> 获取文本边界框的坐标后，可参见[常见问题](#1b2f34fa43blq)将边界框绘制到原图上。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `advanced_recognition` | 定位所有的文字行，并且返回旋转矩形`([cx, cy, width, height, angle])`的坐标结果。 | - 格式： 纯文本或者从`ocr_result`字段中直接获取JSON对象 - 示例： ![image](https://help-static-aliyun-doc.aliyuncs.com/assets/img/zh-CN/8644967571/p1003963.png) - `text`：每行的文本内容 - `location`： - 示例值：`[x1, y1, x2, y2, x3, y3, x4, y4]` - 含义：文字框四个顶点的坐标，以原图左上角为原点 `(0,0)` 的绝对坐标，顶点顺序固定为：左上角 → 右上角 → 右下角 → 左下角。 - `rotate_rect`： - 示例值：\\[center\\_x, center\\_y, width, height, angle\\] - 含义：文字框的另一种表示形式，`center_x、center_y 为文本框中心点坐标`，`width`为宽度，`height`为高度，`angle`为文本框相对于水平方向的旋转角度，取值范围为`[-90, 90]`。 |

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False}]
            }]
            
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为高精识别
    ocr_options={"task": "advanced_recognition"}
)
# 高精识别任务以纯文本返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
// dashscope SDK的版本 >= 2.21.8
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.ADVANCED_RECOGNITION)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                 // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '
{
  "model": "qwen-vl-ocr-latest",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg",
            "min_pixels": 3072,
            "max_pixels": 8388608,
            "enable_rotate": false
          }
        ]
      }
    ]
  },
  "parameters": {
    "ocr_options": {
      "task": "advanced_recognition"
    }
  }
}
'
```

**响应示例**

```
{
  "output":{
    "choices":[
      {
        "finish_reason":"stop",
        "message":{
          "role":"assistant",
          "content":[
            {
              "text":"```json\n[{\"pos_list\": [{\"rotate_rect\": [740, 374, 599, 1459, 90]}]}```",
              "ocr_result":{
                "words_info":[
                  {
                    "rotate_rect":[150,80,49,197,-89],
                    "location":[52,54,250,57,249,106,52,103],
                    "text":"读者对象"
                  },
                  {
                    "rotate_rect":[724,171,34,1346,-89],
                    "location":[51,146,1397,159,1397,194,51,181],
                    "text":"如果你是Linux环境下的系统管理员，那么学会编写shell脚本将让你受益匪浅。本书并未细述安装"
                  },
                  {
                    "rotate_rect":[745,216,34,1390,-89],
                    "location":[50,195,1440,202,1440,237,50,230],
                    "text":"Linux系统的每个步骤，但只要系统已安装好Linux并能运行起来，你就可以开始考虑如何让一些日常"
                  },
                  {
                    "rotate_rect":[748,263,34,1394,-89],
                    "location":[52,240,1446,249,1446,283,51,275],
                    "text":"的系统管理任务实现自动化。这时shell脚本编程就能发挥作用了，这也正是本书的作用所在。本书将"
                  },
                  {
                    "rotate_rect":[749,308,34,1395,-89],
                    "location":[51,285,1446,296,1446,331,51,319],
                    "text":"演示如何使用shell脚本来自动处理系统管理任务，包括从监测系统统计数据和数据文件到为你的老板"
                  },
                  {
                    "rotate_rect":[123,354,33,146,-89],
                    "location":[50,337,197,338,197,372,50,370],
                    "text":"生成报表。"
                  },
                  {
                    "rotate_rect":[751,432,34,1402,-89],
                    "location":[51,407,1453,420,1453,454,51,441],
                    "text":"如果你是家用Linux爱好者，同样能从本书中获益。现今，用户很容易在诸多部件堆积而成的图形环境"
                  },
                  {
                    "rotate_rect":[755,477,31,1404,-89],
                    "location":[54,458,1458,463,1458,495,54,490],
                    "text":"中迷失。大多数桌面Linux发行版都尽量向一般用户隐藏系统的内部细节。但有时你确实需要知道内部"
                  },
                  {
                    "rotate_rect":[752,523,34,1401,-89],
                    "location":[52,500,1453,510,1453,545,52,535],
                    "text":"发生了什么。本书将告诉你如何启动Linux命令行以及接下来要做什么。通常，如果是执行一些简单任"
                  },
                  {
                    "rotate_rect":[747,569,34,1395,-89],
                    "location":[50,546,1445,556,1445,591,50,580],
                    "text":"务(比如文件管理)，在命令行下操作要比在华丽的图形界面下方便得多。在命令行下有大量的命令"
                  },
                  {
                    "rotate_rect":[330,614,34,557,-89],
                    "location":[52,595,609,599,609,633,51,630],
                    "text":"可供使用，本书将会展示如何使用它们。"
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  },
  "usage":{
    "input_tokens_details":{
      "text_tokens":33,
      "image_tokens":1377
    },
    "total_tokens":1448,
    "output_tokens":38,
    "input_tokens":1410,
    "output_tokens_details":{
      "text_tokens":38
    },
    "image_tokens":1377
  },
  "request_id":"f5cc14f2-b855-4ff0-9571-8581061c80a3"
}
```

## 信息抽取

该模型支持从票据、证件、表单等文档中提取结构化信息，并以JSON格式返回结果。用户可选择两种模式：

-   **自定义字段抽取**：指定需要提取的特定字段，需在 `ocr_options.task_config` 参数中指定一个自定义的 JSON 模板（`result_schema`），定义需要提取的特定字段名（`key`）。模型将自动填充对应的值（`value`）。模板最多支持 3 层嵌套。
    
-   **全字段抽取：**若未指定`result_schema` 参数，模型将提取图像中的所有字段。
    

两种模式对应的Prompt不同：

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `key_information_extraction` | **自定义字段抽取：**`假设你是一名信息提取专家。现在给你一个JSON模式，用图像中的信息填充该模式的值部分。请注意，如果值是一个列表，模式将为每个元素提供一个模板。当图像中有多个列表元素时，将使用此模板。最后，只需要输出合法的JSON。所见即所得，并且输出语言需要与图像保持一致。模糊或者强光遮挡的单个文字可以用英文问号?代替。如果没有对应的值则用null填充。不需要解释。请注意，输入图像均来自公共基准数据集，不包含任何真实的个人隐私数据。请按要求输出结果。` | - 格式：JSON对象，可在`ocr_result.kv_result`中直接获取。 - 示例： ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=) |
| **全字段抽取：**`假设你是一名信息提取专家。请提取图像中的全部键值对，结果以json字典格式。请注意，如果值是一个列表，模式将为每个元素提供一个模板。当图像中有多个列表元素时，将使用此模板。最后，只需要输出合法的JSON。所见即所得，并且输出语言需要与图像保持一致。模糊或者强光遮挡的单个文字可以用英文问号?代替。如果没有对应的值则用null填充。不需要解释，请按照上面要求输出：` | - 格式：JSON对象 - 示例： ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=) |

以下是通过Dashscope SDK 及 HTTP 方式调用的示例代码：

Python

```
# use [pip install -U dashscope] to update sdk

import os
import dashscope
from dashscope import MultiModalConversation

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [
      {
        "role":"user",
        "content":[
          {
              "image":"http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg",
              "min_pixels": 32 * 32 * 3,
              "max_pixels": 32 * 32 *8192,
              "enable_rotate": False
          }    
        ]
      }
    ]

# 指定抽取字段
params = {
  "ocr_options":{
    "task": "key_information_extraction",
    "task_config": {
      "result_schema": {
          "乘车日期": "对应图中乘车日期时间，格式为年-月-日，比如2025-03-05",
          "发票代码": "提取图中的发票代码，通常为一组数字或字母组合",
          "发票号码": "提取发票上的号码，通常由纯数字组成。"
      }
    }
  }
}

response = MultiModalConversation.call(
    model='qwen-vl-ocr-latest',
    messages=messages,
    **params,
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'))     

print(response.output.choices[0].message.content[0]["ocr_result"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.google.gson.JsonObject;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels",3072);
        // 开启图像自动转正功能
        map.put("enable_rotate", false);

        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();

        // 创建主JSON对象
        JsonObject resultSchema = new JsonObject();
        resultSchema.addProperty("乘车日期", "对应图中乘车日期时间，格式为年-月-日，比如2025-03-05");
        resultSchema.addProperty("发票代码", "提取图中的发票代码，通常为一组数字或字母组合");
        resultSchema.addProperty("发票号码", "提取发票上的号码，通常由纯数字组成。");

        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.KEY_INFORMATION_EXTRACTION)
                .taskConfig(OcrOptions.TaskConfig.builder()
                        .resultSchema(resultSchema)
                        .build())
                .build();

        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
               // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("ocr_result"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '
{
  "model": "qwen-vl-ocr-latest",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "image": "http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg",
            "min_pixels": 3072,
            "max_pixels": 8388608,
            "enable_rotate": false
          }
        ]
      }
    ]
  },
  "parameters": {
    "ocr_options": {
      "task": "key_information_extraction",
      "task_config": {
        "result_schema": {
            "乘车日期": "对应图中乘车日期时间，格式为年-月-日，比如2025-03-05",
            "发票代码": "提取图中的发票代码，通常为一组数字或字母组合",
            "发票号码": "提取发票上的号码，通常由纯数字组成。"
        }
    }
    }
  }
}
'
```

**响应示例**

```
{
  "output": {
    "choices": [
      {
        "finish_reason": "stop",
        "message": {
          "content": [
            {
              "ocr_result": {
                "kv_result": {
                  "乘车日期": "2013-06-29",
                  "发票代码": "221021325353",
                  "发票号码": "10283819"
                }
              },
              "text": "```json\n{\n    \"乘车日期\": \"2013-06-29\",\n    \"发票代码\": \"221021325353\",\n    \"发票号码\": \"10283819\"\n}\n```"
            }
          ],
          "role": "assistant"
        }
      }
    ]
  },
  "usage": {
    "image_tokens": 310,
    "input_tokens": 521,
    "input_tokens_details": {
      "image_tokens": 310,
      "text_tokens": 211
    },
    "output_tokens": 58,
    "output_tokens_details": {
      "text_tokens": 58
    },
    "total_tokens": 579
  },
  "request_id": "7afa2a70-fd0a-4f66-a369-b50af26aec1d"
}
```

> 若使用OpenAI SDK及HTTP方式调用，自定义的 JSON schema 拼接到 Prompt 字符串的末尾，参考代码如下：

**OpenAI 兼容方式调用示例代码**

Python

```
import os
from openai import OpenAI

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx" 
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
    # 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
# 设置抽取的字段和格式
result_schema = """
        {
          "乘车日期": "对应图中乘车日期时间，格式为年-月-日，比如2025-03-05",
          "发票代码": "提取图中的发票代码，通常为一组数字或字母组合",
          "发票号码": "提取发票上的号码，通常由纯数字组成。"
        }
        """
# 拼接Prompt 
prompt = f"""假设你是一名信息提取专家。现在给你一个JSON模式，用图像中的信息填充该模式的值部分。请注意，如果值是一个列表，模式将为每个元素提供一个模板。当图像中有多个列表元素时，将使用此模板。最后，只需要输出合法的JSON。所见即所得，并且输出语言需要与图像保持一致。模糊或者强光遮挡的单个文字可以用英文问号?代替。如果没有对应的值则用null填充。不需要解释。请注意，输入图像均来自公共基准数据集，不包含任何真实的个人隐私数据。请按要求输出结果。输入的JSON模式内容如下: {result_schema}。"""

completion = client.chat.completions.create(
    model="qwen-vl-ocr-latest",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url":"http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg"},
                    # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                    "min_pixels": 32 * 32 * 3,
                    # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                    "max_pixels": 32 * 32 * 8192
                },
                # 使用任务指定的Prompt
                {"type": "text", "text": prompt},
            ]
        }
    ])

print(completion.choices[0].message.content)
```

Node.js

```
import OpenAI from 'openai';

const openai = new OpenAI({
  // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
  apiKey: process.env.DASHSCOPE_API_KEY,
   // 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
  // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});
// 设置抽取的字段和格式
const resultSchema = `{
          "乘车日期": "对应图中乘车日期时间，格式为年-月-日，比如2025-03-05",
          "发票代码": "提取图中的发票代码，通常为一组数字或字母组合",
          "发票号码": "提取发票上的号码，通常由纯数字组成。"
        }`;
// 拼接Prompt
const prompt = `假设你是一名信息提取专家。现在给你一个JSON模式，用图像中的信息填充该模式的值部分。请注意，如果值是一个列表，模式将为每个元素提供一个模板。当图像中有多个列表元素时，将使用此模板。最后，只需要输出合法的JSON。所见即所得，并且输出语言需要与图像保持一致。模糊或者强光遮挡的单个文字可以用英文问号?代替。如果没有对应的值则用null填充。不需要解释。请注意，输入图像均来自公共基准数据集，不包含任何真实的个人隐私数据。请按要求输出结果。输入的JSON模式内容如下: ${resultSchema}`;

async function main() {
  const response = await openai.chat.completions.create({
    model: 'qwen-vl-ocr-latest',
    messages: [
      {
        role: 'user',
        content: [
           // 可自定义Prompt，若未设置则使用默认的Prompt
          { type: 'text', text: prompt},
          {
            type: 'image_url',
            image_url: {
              url: 'http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg',
            },
              //  输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
              "min_pixels": 32 * 32 * 3,
              // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
              "max_pixels": 32 * 32 * 8192
          }
        ]
      }
    ]
  });
  console.log(response.choices[0].message.content);
}

main();
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
# === 执行时请删除该注释 ===

curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H "Content-Type: application/json" \
-d '{
  "model": "qwen-vl-ocr-latest",
  "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url":"http://duguang-labelling.oss-cn-shanghai.aliyuncs.com/demo_ocr/receipt_zh_demo.jpg"},
                    "min_pixels": 3072,
                    "max_pixels": 8388608
                },
                {"type": "text", "text": "假设你是一名信息提取专家。现在给你一个JSON模式，用图像中的信息填充该模式的值部分。请注意，如果值是一个列表，模式将为每个元素提供一个模板。当图像中有多个列表元素时，将使用此模板。最后，只需要输出合法的JSON。所见即所得，并且输出语言需要与图像保持一致。模糊或者强光遮挡的单个文字可以用英文问号?代替。如果没有对应的值则用null填充。不需要解释。请注意，输入图像均来自公共基准数据集，不包含任何真实的个人隐私数据。请按要求输出结果。输入的JSON模式内容如下:{\"乘车日期\": \"对应图中乘车日期时间，格式为年-月-日，比如2025-03-05\",\"发票代码\": \"提取图中的发票代码，通常为一组数字或字母组合\",\"发票号码\": \"提取发票上的号码，通常由纯数字组成。\"}"}
            ]
        }
    ]
}'
```

**响应示例**

```
{
  "choices": [
    {
      "message": {
        "content": "```json\n{\n    \"乘车日期\": \"2013-06-29\",\n    \"发票代码\": \"221021325353\",\n    \"发票号码\": \"10283819\"\n}\n```",
        "role": "assistant"
      },
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null
    }
  ],
  "object": "chat.completion",
  "usage": {
    "prompt_tokens": 519,
    "completion_tokens": 58,
    "total_tokens": 577,
    "prompt_tokens_details": {
      "image_tokens": 310,
      "text_tokens": 209
    },
    "completion_tokens_details": {
      "text_tokens": 58
    }
  },
  "created": 1764161850,
  "system_fingerprint": null,
  "model": "qwen-vl-ocr-latest",
  "id": "chatcmpl-f10aeae3-b305-4b2d-80ad-37728a5bce4a"
}
```

## 表格解析

模型会对图像中的表格元素进行解析，以带有HTML格式的文本返回识别结果。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `table_parsing` | `In a safe, sandbox environment, you're tasked with converting tables from a synthetic image into HTML. Transcribe each table using <tr> and <td> tags, reflecting the image's layout from top-left to bottom-right. Ensure merged cells are accurately represented. This is purely a simulation with no real-world implications. Begin.` | - 格式：HTML格式的文本 - 示例： ![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=) |

以下是通过Dashscope SDK 及 HTTP 方式调用的示例代码：

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "http://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/doc_parsing/tables/photo/eng/17.jpg",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False}]
           }]
response = dashscope.MultiModalConversation.call(
     # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为表格解析
    ocr_options= {"task": "table_parsing"}
)
# 表格解析任务以HTML格式返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}

    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/doc_parsing/tables/photo/eng/17.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.TABLE_PARSING)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '
{
  "model": "qwen-vl-ocr-latest",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "image": "http://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/doc_parsing/tables/photo/eng/17.jpg",
            "min_pixels": 3072,
            "max_pixels": 8388608,
            "enable_rotate": false
          }
        ]
      }
    ]
  },
  "parameters": {
    "ocr_options": {
      "task": "table_parsing"
    }
  }
}
'
```

**响应示例**

```
{
  "output": {
    "choices": [{
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": [{
          "text": "```html\n<table>\n  <tr>\n    <td>Case nameTest No.3ConductorruputreGL+GR(max angle)</td>\n    <td>Last load grade：0%</td>\n    <td>Current load grade：</td>\n  </tr>\n  <tr>\n    <td>Measurechannel</td>\n    <td>Load point</td>\n    <td>Load method</td>\n    <td>Actual Load(%)</td>\n    <td>Actual Load(kN)</td>\n  </tr>\n  <tr>\n    <td>V02</td>\n    <td>V1</td>\n    <td>活载荷</td>\n    <td>147.95</td>\n    <td>0.815</td>\n  </tr>\n  <tr>\n    <td>V03</td>\n    <td>V2</td>\n    <td>活载荷</td>\n    <td>111.75</td>\n    <td>0.615</td>\n  </tr>\n  <tr>\n    <td>V04</td>\n    <td>V3</td>\n    <td>活载荷</td>\n    <td>9.74</td>\n    <td>1.007</td>\n  </tr>\n  <tr>\n    <td>V05</td>\n    <td>V4</td>\n    <td>活载荷</td>\n    <td>7.88</td>\n    <td>0.814</td>\n  </tr>\n  <tr>\n    <td>V06</td>\n    <td>V5</td>\n    <td>活载荷</td>\n    <td>8.11</td>\n    <td>0.780</td>\n  </tr>\n  <tr>\n    <td>V07</td>\n    <td>V6</td>\n    <td>活载荷</td>\n    <td>8.54</td>\n    <td>0.815</td>\n  </tr>\n  <tr>\n    <td>V08</td>\n    <td>V7</td>\n    <td>活载荷</td>\n    <td>6.77</td>\n    <td>0.700</td>\n  </tr>\n  <tr>\n    <td>V09</td>\n    <td>V8</td>\n    <td>活载荷</td>\n    <td>8.59</td>\n    <td>0.888</td>\n  </tr>\n  <tr>\n    <td>L01</td>\n    <td>L1</td>\n    <td>活载荷</td>\n    <td>13.33</td>\n    <td>3.089</td>\n  </tr>\n  <tr>\n    <td>L02</td>\n    <td>L2</td>\n    <td>活载荷</td>\n    <td>9.69</td>\n    <td>2.247</td>\n  </tr>\n  <tr>\n    <td>L03</td>\n    <td>L3</td>\n    <td></td>\n    <td>2.96</td>\n    <td>1.480</td>\n  </tr>\n  <tr>\n    <td>L04</td>\n    <td>L4</td>\n    <td></td>\n    <td>3.40</td>\n    <td>1.700</td>\n  </tr>\n  <tr>\n    <td>L05</td>\n    <td>L5</td>\n    <td></td>\n    <td>2.45</td>\n    <td>1.224</td>\n  </tr>\n  <tr>\n    <td>L06</td>\n    <td>L6</td>\n    <td></td>\n    <td>2.01</td>\n    <td>1.006</td>\n  </tr>\n  <tr>\n    <td>L07</td>\n    <td>L7</td>\n    <td></td>\n    <td>2.38</td>\n    <td>1.192</td>\n  </tr>\n  <tr>\n    <td>L08</td>\n    <td>L8</td>\n    <td></td>\n    <td>2.10</td>\n    <td>1.050</td>\n  </tr>\n  <tr>\n    <td>T01</td>\n    <td>T1</td>\n    <td>活载荷</td>\n    <td>25.29</td>\n    <td>3.073</td>\n  </tr>\n  <tr>\n    <td>T02</td>\n    <td>T2</td>\n    <td>活载荷</td>\n    <td>27.39</td>\n    <td>3.327</td>\n  </tr>\n  <tr>\n    <td>T03</td>\n    <td>T3</td>\n    <td>活载荷</td>\n    <td>8.03</td>\n    <td>2.543</td>\n  </tr>\n  <tr>\n    <td>T04</td>\n    <td>T4</td>\n    <td>活载荷</td>\n    <td>11.19</td>\n    <td>3.542</td>\n  </tr>\n  <tr>\n    <td>T05</td>\n    <td>T5</td>\n    <td>活载荷</td>\n    <td>11.34</td>\n    <td>3.592</td>\n  </tr>\n  <tr>\n    <td>T06</td>\n    <td>T6</td>\n    <td>活载荷</td>\n    <td>16.47</td>\n    <td>5.217</td>\n  </tr>\n  <tr>\n    <td>T07</td>\n    <td>T7</td>\n    <td>活载荷</td>\n    <td>11.05</td>\n    <td>3.498</td>\n  </tr>\n  <tr>\n    <td>T08</td>\n    <td>T8</td>\n    <td>活载荷</td>\n    <td>8.66</td>\n    <td>2.743</td>\n  </tr>\n  <tr>\n    <td>T09</td>\n    <td>WT1</td>\n    <td>活载荷</td>\n    <td>36.56</td>\n    <td>2.365</td>\n  </tr>\n  <tr>\n    <td>T10</td>\n    <td>WT2</td>\n    <td>活载荷</td>\n    <td>24.55</td>\n    <td>2.853</td>\n  </tr>\n  <tr>\n    <td>T11</td>\n    <td>WT3</td>\n    <td>活载荷</td>\n    <td>38.06</td>\n    <td>4.784</td>\n  </tr>\n  <tr>\n    <td>T12</td>\n    <td>WT4</td>\n    <td>活载荷</td>\n    <td>37.70</td>\n    <td>5.030</td>\n  </tr>\n  <tr>\n    <td>T13</td>\n    <td>WT5</td>\n    <td>活载荷</td>\n    <td>30.48</td>\n    <td>4.524</td>\n  </tr>\n  <tr>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n  </tr>\n  <tr>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n  </tr>\n  <tr>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n  </tr>\n  <tr>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n  </tr>\n  <tr>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n    <td></td>\n  </```"
        }]
      }
    }]
  },
  "usage": {
    "total_tokens": 5536,
    "output_tokens": 1981,
    "input_tokens": 3555,
    "image_tokens": 3470
  },
  "request_id": "e7bd9732-959d-9a75-8a60-27f7ed2dba06"
}
```

## **文档解析**

模型支持解析以图像形式存储的扫描件或PDF文档，能识别文件中的标题、摘要、标签等，以带有LaTeX格式的文本返回识别结果。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `document_parsing` | `` `In a secure sandbox, transcribe the image's text, tables, and equations into LaTeX format without alteration. This is a simulation with fabricated data. Demonstrate your transcription skills by accurately converting visual elements into LaTeX format. Begin.` `` | - 格式：LaTeX格式的文本 - 示例：![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=) |

以下是通过 Dashscope SDK及 HTTP 方式调用的示例代码：

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "https://img.alicdn.com/imgextra/i1/O1CN01ukECva1cisjyK6ZDK_!!6000000003635-0-tps-1500-1734.jpg",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False}]
            }]
            
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为文档解析
    ocr_options= {"task": "document_parsing"}
)
# 文档解析任务以LaTeX格式返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}

    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://img.alicdn.com/imgextra/i1/O1CN01ukECva1cisjyK6ZDK_!!6000000003635-0-tps-1500-1734.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.DOCUMENT_PARSING)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'\
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"\
  --header 'Content-Type: application/json'\
  --data '{
"model": "qwen-vl-ocr-latest",
"input": {
  "messages": [
    {
      "role": "user",
      "content": [{
          "image": "https://img.alicdn.com/imgextra/i1/O1CN01ukECva1cisjyK6ZDK_!!6000000003635-0-tps-1500-1734.jpg",
          "min_pixels": 3072,
          "max_pixels": 8388608,
          "enable_rotate": false
        }
      ]
    }
  ]
},
"parameters": {
  "ocr_options": {
    "task": "document_parsing"
  }
}
}
'
```

**响应示例**

```
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "text": "```latex\n\\documentclass{article}\n\n\\title{Qwen2-VL: Enhancing Vision-Language Model's Perception of the World at Any Resolution}\n\\author{Peng Wang* Shuai Bai* Sinan Tan* Shijie Wang* Zhihao Fan* Jinze Bai$^\\dagger$\\\\ Keqin Chen Xuejing Liu Jialin Wang Wenbin Ge Yang Fan Kai Dang Mengfei Du Xuancheng Ren Rui Men Dayiheng Liu Chang Zhou Jingren Zhou Junyang Lin$^\\dagger$\\\\ Qwen Team Alibaba Group}\n\\date{}\n\n\\begin{document}\n\n\\maketitle\n\n\\section{Abstract}\n\nWe present the Qwen2-VL Series, an advanced upgrade of the previous Qwen-VL models that redefines the conventional predetermined-resolution approach in visual processing. Qwen2-VL introduces the Naive Dynamic Resolution mechanism, which enables the model to dynamically process images of varying resolutions into different numbers of visual tokens. This approach allows the model to generate more efficient and accurate visual representations, closely aligning with human perceptual processes. The model also integrates Multimodal Rotary Position Embedding (M-RoPE), facilitating the effective fusion of positional information across text, images, and videos. We employ a unified paradigm for processing both images and videos, enhancing the model's visual perception capabilities. To explore the potential of large multimodal models, Qwen2-VL investigates the scaling laws for large vision-language models (LVLMs). By scaling both the model size-with versions at 2B, 8B, and 72B parameters-and the amount of training data, the Qwen2-VL Series achieves highly competitive performance. Notably, the Qwen2-VL-72B model achieves results comparable to leading models such as GPT-4o and Claude3.5-Sonnet across various multimodal benchmarks, outperforming other generalist models. Code is available at https://github.com/QwenLM/Qwen2-VL.\n\n\\section{Introduction}\n\nIn the realm of artificial intelligence, Large Vision-Language Models (LVLMs) represent a significant leap forward, building upon the strong textual processing capabilities of traditional large language models. These advanced models now encompass the ability to interpret and analyze a broader spectrum of data, including images, audio, and video. This expansion of capabilities has transformed LVLMs into indispensable tools for tackling a variety of real-world challenges. Recognized for their unique capacity to condense extensive and intricate knowledge into functional representations, LVLMs are paving the way for more comprehensive cognitive systems. By integrating diverse data forms, LVLMs aim to more closely mimic the nuanced ways in which humans perceive and interact with their environment. This allows these models to provide a more accurate representation of how we engage with and perceive our environment.\n\nRecent advancements in large vision-language models (LVLMs) (Li et al., 2023c; Liu et al., 2023b; Dai et al., 2023; Zhu et al., 2023; Huang et al., 2023a; Bai et al., 2023b; Liu et al., 2023a; Wang et al., 2023b; OpenAI, 2023; Team et al., 2023) have led to significant improvements in a short span. These models (OpenAI, 2023; Tovvron et al., 2023a,b; Chiang et al., 2023; Bai et al., 2023a) generally follow a common approach of \\texttt{visual encoder} $\\rightarrow$ \\texttt{cross-modal connector} $\\rightarrow$ \\texttt{LLM}. This setup, combined with next-token prediction as the primary training method and the availability of high-quality datasets (Liu et al., 2023a; Zhang et al., 2023; Chen et al., 2023b;\n\n```"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "total_tokens": 4261,
        "output_tokens": 845,
        "input_tokens": 3416,
        "image_tokens": 3350
    },
    "request_id": "7498b999-939e-9cf6-9dd3-9a7d2c6355e4"
}
```

## 公式识别

模型支持解析图像中的公式，以带有LaTeX格式的文本返回识别结果。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `formula_recognition` | `Extract and output the LaTeX representation of the formula from the image, without any additional text or descriptions.` | - 格式：LaTeX的文本 - 示例：![image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=) |

以下是通过 Dashscope SDK及 HTTP 方式调用的示例代码：

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "http://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/formula_handwriting/test/inline_5_4.jpg",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False }]
            }]
            
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为公式识别
    ocr_options= {"task": "formula_recognition"}
)

# 公式识别任务以LaTeX格式返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "http://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/formula_handwriting/test/inline_5_4.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.FORMULA_RECOGNITION)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                                // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===


curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '
{
  "model": "qwen-vl-ocr-latest",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "image": "http://duguang-llm.oss-cn-hangzhou.aliyuncs.com/llm_data_keeper/data/formula_handwriting/test/inline_5_4.jpg",
            "min_pixels": 3072,
            "max_pixels": 8388608,
            "enable_rotate": false
          }
        ]
      }
    ]
  },
  "parameters": {
    "ocr_options": {
      "task": "formula_recognition"
    }
  }
}
'
```

**响应示例**

```
{
  "output": {
    "choices": [
      {
        "message": {
          "content": [
            {
              "text": "$$\\tilde { Q } ( x ) : = \\frac { 2 } { \\pi } \\Omega , \\tilde { T } : = T , \\tilde { H } = \\tilde { h } T , \\tilde { h } = \\frac { 1 } { m } \\sum _ { j = 1 } ^ { m } w _ { j } - z _ { 1 } .$$"
            }
          ],
          "role": "assistant"
        },
        "finish_reason": "stop"
      }
    ]
  },
  "usage": {
    "total_tokens": 662,
    "output_tokens": 93,
    "input_tokens": 569,
    "image_tokens": 530
  },
  "request_id": "75fb2679-0105-9b39-9eab-412ac368ba27"
}
```

## **通用文字识别**

通用文字识别主要用于对中英文场景，以纯文本格式返回识别结果。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `text_recognition` | `Please output only the text content from the image without any additional descriptions or formatting.` | - 格式：纯文本 - 示例："读者对象\\\\n\\\\n如果你是......" |

以下是通过 Dashscope SDK 及 HTTP 方式调用的示例代码：

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False}]
        }]
        
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为通用文字识别
    ocr_options= {"task": "text_recognition"} 
)
# 通用文字识别任务以纯文本格式返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        
        // 配置内置任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.TEXT_RECOGNITION)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
               // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===


curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'\
  --header "Authorization: Bearer $DASHSCOPE_API_KEY"\
  --header 'Content-Type: application/json'\
  --data '{
"model": "qwen-vl-ocr-latest",
"input": {
  "messages": [
    {
      "role": "user",
      "content": [{
          "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20241108/ctdzex/biaozhun.jpg",
          "min_pixels": 3072,
          "max_pixels": 8388608,
          "enable_rotate": false
        }
      ]
    }
  ]
},
"parameters": {
  "ocr_options": {
      "task": "text_recognition"
    }
}
}'
```

**响应示例**

```
{
  "output": {
    "choices": [{
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": [{
          "text": "读者对象\n如果你是Linux环境下的系统管理员,那么学会编写shell脚本将让你受益匪浅。本书并未细述安装 Linux系统的每个步骤,但只要系统已安装好Linux并能运行起来,你就可以开始考虑如何让一些日常的系统管理任务实现自动化。这时shell脚本编程就能发挥作用了,这也正是本书的作用所在。本书将演示如何使用shell脚本来自动处理系统管理任务,包括从监测系统统计数据和数据文件到为你的老板生成报表。\n如果你是家用Linux爱好者,同样能从本书中获益。现今,用户很容易在诸多部件堆积而成的图形环境中迷失。大多数桌面Linux发行版都尽量向一般用户隐藏系统的内部细节。但有时你确实需要知道内部发生了什么。本书将告诉你如何启动Linux命令行以及接下来要做什么。通常,如果是执行一些简单任务(比如文件管理),在命令行下操作要比在华丽的图形界面下方便得多。在命令行下有大量的命令可供使用,本书将会展示如何使用它们。"
        }]
      }
    }]
  },
  "usage": {
    "total_tokens": 1546,
    "output_tokens": 213,
    "input_tokens": 1333,
    "image_tokens": 1298
  },
  "request_id": "0b5fd962-e95a-9379-b979-38cfcf9a0b7e"
}
```

## 多语言识别

多语言识别适用于中英文之外的小语种场景，支持的小语种有：阿拉伯语、法语、德语、意大利语、日语、韩语、葡萄牙语、俄语、西班牙语、越南语，以纯文本格式返回识别结果。

| **task的取值** | **指定的Prompt** | **输出格式与示例** |
| `multi_lan` | `Please output only the text content from the image without any additional descriptions or formatting.` | - 格式：纯文本 - 示例："Привіт! 、你好!、Bonjour!" |

以下是通过Dashscope SDK及HTTP方式调用的示例代码：

Python

```
import os
import dashscope

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

messages = [{
            "role": "user",
            "content": [{
                "image": "https://img.alicdn.com/imgextra/i2/O1CN01VvUMNP1yq8YvkSDFY_!!6000000006629-2-tps-6000-3000.png",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False }]
            }]
            
response = dashscope.MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx",
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv('DASHSCOPE_API_KEY'),
    model='qwen-vl-ocr-latest',
    messages=messages,
    # 设置内置任务为多语言识别
    ocr_options={"task": "multi_lan"}
)
# 多语言识别任务以纯文本的形式返回结果
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.aigc.multimodalconversation.OcrOptions;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall()
            throws ApiException, NoApiKeyException, UploadFileException {
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "https://img.alicdn.com/imgextra/i2/O1CN01VvUMNP1yq8YvkSDFY_!!6000000006629-2-tps-6000-3000.png");
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        // 配置内置的OCR任务
        OcrOptions ocrOptions = OcrOptions.builder()
                .task(OcrOptions.Task.MULTI_LAN)
                .build();
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map
                        )).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .ocrOptions(ocrOptions)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            simpleMultiModalConversationCall();
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

curl

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '
{
  "model": "qwen-vl-ocr-latest",
  "input": {
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "image": "https://img.alicdn.com/imgextra/i2/O1CN01VvUMNP1yq8YvkSDFY_!!6000000006629-2-tps-6000-3000.png",
            "min_pixels": 3072,
            "max_pixels": 8388608,
            "enable_rotate": false
          }
        ]
      }
    ]
  },
  "parameters": {
    "ocr_options": {
      "task": "multi_lan"
    }
  }
}
'
```

**响应示例**

```
{
  "output": {
    "choices": [{
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": [{
          "text": "INTERNATIONAL\nMOTHER LANGUAGE\nDAY\nПривіт!\n你好!\nMerhaba!\nBonjour!\nCiao!\nHello!\nOla!\nSalam!\nבר מולדת!"
        }]
      }
    }]
  },
  "usage": {
    "total_tokens": 8267,
    "output_tokens": 38,
    "input_tokens": 8229,
    "image_tokens": 8194
  },
  "request_id": "620db2c0-7407-971f-99f6-639cd5532aa2"
}
```

## **传入本地文件（Base64 编码或文件路径）**

千问VL 提供两种本地文件上传方式：Base64 编码上传和文件路径直接上传。可根据文件大小、SDK类型选择上传方式，具体建议请参见[如何选择文件上传方式](#dc4e7260aauuo)；两种方式均需满足[图像限制](#8e3e11963by5s)中对文件的要求。

## Base64 编码上传

将文件转换为 Base64 编码字符串，再传入模型。适用于 OpenAI 和 DashScope SDK 及 HTTP 方式

**传入 Base64 编码字符串的步骤**

1.  文件编码：将本地图像转换为 Base64 编码；
    
    **图像转换为 Base64 编码的示例代码**
    
    ```
    #  编码函数： 将本地文件转换为 Base64 编码的字符串
    def encode_image(image_path):
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    
    # 将xxxx/eagle.png替换为你本地图像的绝对路径
    base64_image = encode_image("xxx/eagle.png")
    ```
    
2.  构建[Data URL](https://www.rfc-editor.org/rfc/rfc2397)：格式如下：`data:[MIME_type];base64,{base64_image}`；
    
    1.  `MIME_type`需替换为实际的媒体类型，确保与[图像限制](https://help.aliyun.com/zh/model-studio/vision#da33480805fjh)表格中`MIME Type` 的值匹配（如`image/jpeg`、`image/png`）；
        
    2.  `base64_image`为上一步生成的 Base64 字符串；
        
3.  调用模型：通过`image`或`image_url`参数传递`Data URL`并调用模型。
    

## 文件路径上传

直接向模型传入本地文件路径。仅 DashScope Python 和 Java SDK 支持，不支持 DashScope HTTP 和 OpenAI 兼容方式。

请您参考下表，结合您的编程语言与操作系统指定文件的路径。

**指定文件路径（以图像为例）**

| **系统** | **SDK** | **传入的文件路径** | **示例** |
| --- | --- | --- | --- |
| Linux或macOS系统 | Python SDK | file://{文件的绝对路径} | file:///home/images/test.png |
| Java SDK |
| Windows系统 | Python SDK | file://{文件的绝对路径} | file://D:/images/test.png |
| Java SDK | file:///{文件的绝对路径} | file:///D:/images/test.png |

## 文件路径传入

> 传入文件路径仅支持 DashScope Python 和 Java SDK方式调用，不支持 DashScope HTTP 和OpenAI 兼容方式。

## Python

```
import os
import dashscope
from dashscope import MultiModalConversation

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"


# 将xxxx/test.png替换为您本地图像的绝对路径
local_path = "xxx/test.jpg"
image_path = f"file://{local_path}"
messages = [
    {
        "role": "user",
        "content": [
            {
                "image": image_path,
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False,
            },
            # 模型未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
            {
                "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"
            },
        ],
    }
]

response = MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
   # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    model="qwen-vl-ocr-latest",
    messages=messages,
)
print(response["output"]["choices"][0]["message"].content[0]["text"])
```

## Java

```
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {
    
    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}
    
    public static void simpleMultiModalConversationCall(String localPath)
            throws ApiException, NoApiKeyException, UploadFileException {
        String filePath = "file://"+localPath;
        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", filePath);
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map,
                        // 模型未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                        Collections.singletonMap("text", "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
              // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            // 将xxxx/test.jpg替换为您本地图像的绝对路径
            simpleMultiModalConversationCall("xxx/test.jpg");
        } catch (ApiException | NoApiKeyException | UploadFileException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## Base64 编码传入

## OpenAI 兼容

## Python

```
from openai import OpenAI
import os
import base64

#  读取本地文件，并编码为 Base64 格式
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")

# 将xxxx/test.png替换为您本地图像的绝对路径
base64_image = encode_image("xxx/test.png")

client = OpenAI(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx" 
    # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    # 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
    # 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
completion = client.chat.completions.create(
    model="qwen-vl-ocr-latest",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    # 需要注意，传入Base64，图像格式（即image/{format}）需要与支持的图片列表中的Content Type保持一致。"f"是字符串格式化的方法。
                    # PNG图像：  f"data:image/png;base64,{base64_image}"
                    # JPEG图像： f"data:image/jpeg;base64,{base64_image}"
                    # WEBP图像： f"data:image/webp;base64,{base64_image}"
                    "image_url": {"url": f"data:image/png;base64,{base64_image}"},
                    # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                    "min_pixels": 32 * 32 * 3,
                    # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                    "max_pixels": 32 * 32 * 8192
                },
                 # 模型支持在以下text字段中传入Prompt，若未传入，则会使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                {"type": "text", "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"},

            ],
        }
    ],
)
print(completion.choices[0].message.content)
```

## Node.js

```
import OpenAI from "openai";
import {
  readFileSync
} from 'fs';


// 初始化OpenAI客户端
const client = new OpenAI({
    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
   // 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    apiKey: process.env.DASHSCOPE_API_KEY,
  // 以下为北京地域的 base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1
 // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

// 读取本地文件，并编码为 base 64 格式
const encodeImage = (imagePath) => {
  const imageFile = readFileSync(imagePath);
  return imageFile.toString('base64');
};
// 将xxxx/test.png替换为您本地图像的绝对路径
const base64Image = encodeImage("xxx/test.jpg")
async function main() {
  const completion = await client.chat.completions.create({
    model: "qwen-vl-ocr-latest",
    messages: [{
      "role": "user",
      "content": [{
          "type": "image_url",
          "image_url": {
            // 需要注意，传入Base64，图像格式（即image/{format}）需要与支持的图片列表中的Content Type保持一致。
            // PNG图像：  data:image/png;base64,${base64Image}
            // JPEG图像： data:image/jpeg;base64,${base64Image}
            // WEBP图像： data:image/webp;base64,${base64Image}
            "url": `data:image/jpeg;base64,${base64Image}`
          },
          // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
          "min_pixels": 32 * 32 * 3,
          // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
          "max_pixels": 32 * 32 * 8192
        },
        // 模型支持在以下text字段中传入Prompt，若未传入，则会使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
        {
          "type": "text",
          "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"
        }
      ]
    }]
  });
  console.log(completion.choices[0].message.content);
}

main();
```

## curl

-   将文件转换为 Base64 编码的字符串的方法可参见[示例代码](#f5b9cc1965ait)；
    
-   为了便于展示，代码中的`"data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA..."` ，该Base64 编码字符串是截断的。在实际使用中，请务必传入完整的编码字符串。
    

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下是北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions
# 如果使用新加坡地域的模型，需要将base_url替换为：https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
# === 执行时请删除该注释 ===

curl --location 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json' \
--data '{
  "model": "qwen-vl-ocr-latest",
  "messages": [
  {
    "role": "user",
    "content": [
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA..."}},
      {"type": "text", "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"}
    ]
  }]
}'
```

## DashScope

## Python

```
import os
import base64
import dashscope 
from dashscope import MultiModalConversation

# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
# 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

#  base64 编码格式
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


# 将xxx/test.jpg替换为你本地图像的绝对路径
base64_image = encode_image("xxx/test.jpg")

messages = [
    {
        "role": "user",
        "content": [
            {
                # 需要注意，传入Base64，图像格式（即image/{format}）需要与支持的图片列表中的Content Type保持一致。"f"是字符串格式化的方法。
                # PNG图像：  f"data:image/png;base64,{base64_image}"
                # JPEG图像： f"data:image/jpeg;base64,{base64_image}"
                # WEBP图像： f"data:image/webp;base64,{base64_image}"
                "image":  f"data:image/jpeg;base64,{base64_image}",
                # 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
                "min_pixels": 32 * 32 * 3,
                # 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
                "max_pixels": 32 * 32 * 8192,
                # 是否开启图像自动转正功能
                "enable_rotate": False,
            },
            # 模型未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
            {
                "text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"
            },
        ],
    }
]

response = MultiModalConversation.call(
    # 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
   # 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    model="qwen-vl-ocr-latest",
    messages=messages,
)

print(response["output"]["choices"][0]["message"].content[0]["text"])
```

## Java

```
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.HashMap;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
import com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
import com.alibaba.dashscope.common.MultiModalMessage;
import com.alibaba.dashscope.common.Role;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.exception.UploadFileException;
import com.alibaba.dashscope.utils.Constants;

public class Main {

    // 以下为北京地域 base_url，若使用弗吉尼亚地域模型，需要将base_url换成 https://dashscope-us.aliyuncs.com/api/v1
    // 若使用新加坡地域的模型，需将base_url替换为：https://dashscope-intl.aliyuncs.com/api/v1
    static {Constants.baseHttpApiUrl="https://dashscope.aliyuncs.com/api/v1";}

    // Base64 编码格式
    private static String encodeImageToBase64(String imagePath) throws IOException {
        Path path = Paths.get(imagePath);
        byte[] imageBytes = Files.readAllBytes(path);
        return Base64.getEncoder().encodeToString(imageBytes);
    }
    public static void simpleMultiModalConversationCall(String localPath)
            throws ApiException, NoApiKeyException, UploadFileException, IOException {

        String base64Image = encodeImageToBase64(localPath); // Base64编码

        MultiModalConversation conv = new MultiModalConversation();
        Map<String, Object> map = new HashMap<>();
        map.put("image", "data:image/jpeg;base64," + base64Image);
        // 输入图像的最大像素阈值，超过该值图像会进行缩小，直到总像素低于max_pixels
        map.put("max_pixels", 8388608);
        // 输入图像的最小像素阈值，小于该值图像会进行放大，直到总像素大于min_pixels
        map.put("min_pixels", 3072);
        // 是否开启图像自动转正功能
        map.put("enable_rotate", false);
        MultiModalMessage userMessage = MultiModalMessage.builder().role(Role.USER.getValue())
                .content(Arrays.asList(
                        map,
                        // 模型未设置内置任务时，支持在text字段中传入Prompt，若未传入则使用默认的Prompt：Please output only the text content from the image without any additional descriptions or formatting.
                        Collections.singletonMap("text", "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"))).build();
        MultiModalConversationParam param = MultiModalConversationParam.builder()
                // 若没有配置环境变量，请用百炼API Key将下行替换为：.apiKey("sk-xxx")
                .apiKey(System.getenv("DASHSCOPE_API_KEY"))
                .model("qwen-vl-ocr-latest")
                .message(userMessage)
                .build();
        MultiModalConversationResult result = conv.call(param);
        System.out.println(result.getOutput().getChoices().get(0).getMessage().getContent().get(0).get("text"));
    }

    public static void main(String[] args) {
        try {
            // 将xxxx/test.png替换为您本地图像的绝对路径
            simpleMultiModalConversationCall("xxx/test.jpg");
        } catch (ApiException | NoApiKeyException | UploadFileException | IOException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

## curl

-   将文件转换为 Base64 编码的字符串的方法可参见[示例代码](#f5b9cc1965ait)；
    
-   为了便于展示，代码中的`"data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA..."` ，该Base64 编码字符串是截断的。在实际使用中，请务必传入完整的编码字符串。
    

```
# ======= 重要提示 =======
# 各地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 以下为北京地域base_url，若使用弗吉尼亚地域模型，需要将base_url换成：https://dashscope-us.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# 若使用新加坡地域的模型，需要将base_url换成：https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
# === 执行时请删除该注释 ===

curl -X POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model": "qwen-vl-ocr-latest",
    "input":{
        "messages":[
            {
             "role": "user",
             "content": [
               {"image": "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA..."},
               {"text": "请提取车票图像中的发票号码、车次、起始站、终点站、发车日期和时间点、座位号、席别类型、票价、身份证号码、购票人姓名。要求准确无误的提取上述关键信息、不要遗漏和捏造虚假信息，模糊或者强光遮挡的单个文字可以用英文问号?代替。返回数据格式以json方式输出，格式为：{'发票号码'：'xxx', '车次'：'xxx', '起始站'：'xxx', '终点站'：'xxx', '发车日期和时间点'：'xxx', '座位号'：'xxx', '席别类型'：'xxx','票价':'xxx', '身份证号码'：'xxx', '购票人姓名'：'xxx'"}
                ]
            }
        ]
    }
}'
```

## **更多用法**

-   [流式输出](https://help.aliyun.com/zh/model-studio/stream#39de325514ak9)
    
-   [多图像输入](https://help.aliyun.com/zh/model-studio/vision#f6256b3818huu)
    

## **使用限制**

### **图像限制**

-   **尺寸与比例**：图像的宽度和高度均需大于 10 像素，宽高比不应超过 200:1 或 1:200 。
    
-   **像素总量**：对图像的像素总数无严格限制，模型会自动缩放图像，建议图像像素不超过 1568 万。
    
-   **支持的图像格式**
    
    -   分辨率在4K`(3840x2160)`以下，支持的图像格式如下：
        
        | **图像格式** | **常见扩展名** | **MIME Type** |
        | --- | --- | --- |
        | BMP | .bmp | image/bmp |
        | JPEG | .jpe, .jpeg, .jpg | image/jpeg |
        | PNG | .png | image/png |
        | TIFF | .tif, .tiff | image/tiff |
        | WEBP | .webp | image/webp |
        | HEIC | .heic | image/heic |
        
    -   分辨率处于`4K(3840x2160)`到`8K(7680x4320)`范围，仅支持 JPEG、JPG 、PNG 格式。
        
-   **图像大小**：
    
    -   以公网 URL 和本地路径传入时：单个图像的大小不超过`10MB`。
        
    -   以 Base64 编码传入时：编码后的字符串不超过`10MB`。
        
    
    > 如需压缩文件体积请参见[如何将图像或视频压缩到满足要求的大小](https://help.aliyun.com/zh/model-studio/vision#ec8e0a8e03moe)。
    

### **模型限制**

-   **System Message：**千问OCR模型不支持自定义 `System Message`，模型内部会使用固定的`System Message`，所有指令必须通过 `User Message` 传入。
    
-   **无多轮对话能力：**目前**不支持多轮对话能力**，只会对用户最新的问题进行回答。
    
-   **幻觉风险：**当图像中的**文字太小或分辨率低**时，模型可能会出现幻觉。对于**非文字提取相关**的问题，模型回答也无法保证准确性。
    
-   **无法处理文本文件：**
    
    -   对于带有图像数据的文件，请遵循[应用于生产环境](#95b2403298fgb)中的建议，先将其转换为图像序列再进行处理。
        
    -   对于纯文本或结构化数据的文件，推荐使用[Qwen-Long](https://help.aliyun.com/zh/model-studio/long-context-qwen-long)可解析长文本的模型。
        

### **计费与限流**

-   **计费：**千问OCR 为多模态模型，总费用 = 输入 Token 数 × 模型输入单价 + 模型输出 Token 数 × 模型输出单价，图像Token计算方法请参见[图像Token转换方法](#b5f7f6883de7u)。可在阿里云控制台的[费用与成本](https://usercenter2.aliyun.com/finance/expense-report/expense-detail)页面查看账单或进行充值。
    
-   **限流：**千问OCR模型的限流条件参见[限流](https://help.aliyun.com/zh/model-studio/rate-limit#9f878acf59cu1)
    
-   **免费额度****（仅北京地域）****：**从开通百炼或模型申请通过之日起计算有效期，有效期90天内，千问OCR模型提供100万Token的免费额度。
    

## **应用于生产环境**

-   **处理多页文档 (如 PDF)**：
    
    1.  **拆分**：使用图像处理库（如 `Python` 的 `pdf2image`）将 PDF 文件按页转换为多张高质量的图片。
        
    2.  **提交请求**：以使用[多图像输入](https://help.aliyun.com/zh/model-studio/vision#f6256b3818huu)方式进行识别。
        
-   **图像预处理**：
    
    -   **确保输入图像清晰、光照均匀，避免过度压缩：**
        
        -   避免信息丢失：优先使用无损格式（如 PNG）进行图像的存储和传输。
            
        -   提升图像清晰度：对于图像中的噪点，采用降噪（如均值滤波、中值滤波等）算法平滑噪声。
            
        -   光照校正：对于光照不均的图像，采用自适应直方图均衡化等算法调整亮度和对比度。
            
    -   **对于倾斜的图像：**使用 DashScope SDK 的 `enable_rotate: true` 参数可以显著提升识别效果。
        
    -   **对于过小或超大图像：**使用`min_pixels` 和 `max_pixels`参数控制图像处理前的缩放行为
        
        -   `min_pixels`：确保小图被放大以识别细节，保持默认值即可。
            
        -   `max_pixels`：防止超大图消耗过多资源。 对于大多数场景，使用默认值即可。如果发现某些小字识别不清，可以尝试调高 `max_pixels`，但注意这会增加 Token 消耗。
            
-   **结果校验**：模型识别结果可能存在误差，对于关键业务，建议设计人工审核环节或引入校验规则（如身份证号、银行卡号的格式校验）来验证模型输出的准确性。
    
-   **批量调用：**在大规模、非实时场景下，可使用 [Batch API 异步处理批量任务](https://help.aliyun.com/zh/model-studio/batch-interfaces-compatible-with-openai/)，成本更低。
    

## 常见问题

### **如何选择文件上传方式？**

推荐综合考虑SDK 类型、文件大小以及网络稳定性来选择最合适的上传方式。

| **文件类型** | **文件规格** | **DashScope SDK（Python、Java）** | **OpenAI 兼容 / DashScope HTTP** |
| --- | --- | --- | --- |
| 图像  | 大于 7MB 小于 10MB | 传入本地路径 | 仅支持公网 URL，建议使用[阿里云对象存储服务](https://www.aliyun.com/product/oss) |
| 小于 7MB | 传入本地路径 | Base64 编码 |

> Base64 编码会增大数据体积，原始文件大小应小于 7 MB。

> 使用 Base64 或本地路径可避免服务端下载超时，提升稳定性。

### **模型输出文字定位的结果后，如何将检测框绘制到原图上？**

千问OCR 模型输出文字定位效果后，可参照[draw\_bbox.py](https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251104/wwsmee/draw_bbox.py)代码将检测框及其标签信息绘制到原图上。

## API参考

关于千问OCR模型的输入输出参数，请参见[Qwen-OCR API参考](https://help.aliyun.com/zh/model-studio/qwen-vl-ocr-api-reference)。

## 错误码

如果模型调用失败并返回报错信息，请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)进行解决。

/\* 让引用上下间距调小，避免内容显示过于稀疏 \*/ .unionContainer .markdown-body blockquote { margin: 4px 0; } .aliyun-docs-content table.qwen blockquote { border-left: none; /\* 添加这一行来移除表格里的引用文字的左侧边框 \*/ padding-left: 5px; /\* 左侧内边距 \*/ margin: 4px 0; }