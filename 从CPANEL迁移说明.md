# 从cPanel迁移到Vercel／Supabase

这不是覆盖式升级。请把v4建立为一个新的Vercel Project，并暂时保留cPanel v3。

现有学生的浏览器记录不会自动出现在新域名，因为LocalStorage跟随域名。

如果需要迁移旧记录：

1. 学生先在cPanel v3点击“下载学习记录”。
2. 打开Vercel v4并使用Email Magic Link登录。
3. 点击“载入记录”，选择旧版导出的JSON。
4. 点击“保存到云端”。

v4可以读取v3的记录格式，并会加入ATASS、CLV、CLOSER、异议练习和AI答案。

确认测试班级迁移成功后，才把正式课程链接改成Vercel网址。
