# MCEO Sales OS v4｜Vercel + Supabase部署说明

## 一、建立Supabase

1. 登录Supabase并建立一个Project。
2. 进入SQL Editor，完整运行 `supabase/setup.sql`。
3. 进入Authentication → URL Configuration。
4. Site URL先填写Vercel正式网址；部署前可以暂时使用Vercel Preview网址。
5. 把正式网址与需要使用的Preview网址加入Redirect URLs。
6. 保留Email Magic Link登录方式。

## 二、取得Supabase资料

在Supabase Project Settings取得：

- Project URL
- Publishable Key
- Service Role Key

Publishable Key可以用于前端，但必须配合RLS。Service Role Key只能放在Vercel服务器环境变量。

## 三、部署到Vercel

推荐把整个文件夹放入一个GitHub Repository，再在Vercel选择Import Project。

Vercel会自动执行：

```text
npm install
npm run build
```

## 四、Vercel环境变量

在Project Settings → Environment Variables加入：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
MCEO_AI_PER_MINUTE_LIMIT
MCEO_AI_DAILY_LIMIT
```

建议值见 `.env.example`。`SUPABASE_SERVICE_ROLE_KEY`和`OPENAI_API_KEY`必须设为Sensitive，并且不可使用`VITE_`前缀。

加入或修改环境变量后必须重新Deploy。

## 五、测试顺序

1. 打开 `https://你的Vercel网址/api/health`，确认 `ok: true`。
2. 在Supabase Auth URL Configuration加入相同网址。
3. 打开Sales OS，输入Email并发送Magic Link。
4. 点击Email内的链接，确认自动登录。
5. 完成ATASS并带入CLV。
6. 点击“保存到云端”，换浏览器登录后测试“载入云端记录”。
7. 分别测试ATASS、CLOSER和异议处理的AI按钮。
8. 在Supabase Table Editor确认`student_workspaces`与`ai_usage`出现记录。

## 六、正式上线前

- 保留cPanel旧版网址作为短期后备，不要立即删除。
- 确认所有学生使用自己的Email登录。
- 在OpenAI设置API预算与用量提醒。
- 在Vercel设置Production与Preview各自的环境变量。
- 先用测试班级完成一轮，再替换正式链接。

## 数据说明

- 学生每个账号拥有一份Sales OS云端Workspace。
- RLS限制学生只能读取、建立、更新及删除自己的Workspace。
- 浏览器LocalStorage仍保留作为临时备份。
- AI接口必须验证Supabase登录Token。
- AI调用次数按学生账号限制。
