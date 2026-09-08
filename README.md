# 应用门户部署说明

## 概述
一个统一的应用门户系统。支持管理员/用户两种角色，管理员可通过可视化面板为不同用户分配应用权限（只读/读写/不显示）。

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | 门户首页（登录 + 应用 Dashboard + 管理员面板） |
| `apps.json` | 应用清单配置（增减应用改这里） |
| `cat.jpg` | Logo 图片（可替换） |
| `setup_portal.sql` | Supabase 数据库初始化脚本 |
| `apps/` | 存放各个子应用的目录 |

## 部署步骤

### 第一步：配置 Supabase 数据库

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，进入你的项目
2. 左侧菜单 → **SQL Editor** → **New query**
3. 复制 `setup_portal.sql` 的全部内容，粘贴后点击 **Run**
4. 执行成功后，会自动创建：
   - `user_app_permissions` 表（用户-应用权限关系）
   - `is_admin` 函数（判断是否管理员）
   - `get_user_permissions` 函数（读取用户权限）
   - `set_app_permissions_batch` 函数（批量设置权限）
   - RLS 行级安全策略

### 第二步：添加用户

1. Supabase → **Authentication** → **Users** → **Add user**
2. 输入邮箱和密码，点击 **Create user**
3. 管理员账号：`alonzhang76@outlook.com`（可在 SQL 中修改）

### 第三步：组织文件结构

将所有应用放入 `apps/` 目录下，结构如下：

```
你的仓库/
├── index.html              ← 门户首页
├── apps.json               ← 应用配置
├── cat.jpg                 ← Logo
├── setup_portal.sql        ← 数据库脚本（可选上传）
└── apps/
    ├── wicketproduct/      ← 计件工资应用
    │   ├── index.html
    │   ├── login.html
    │   ├── js/
    │   └── ...
    ├── app2/               ← 应用二
    │   └── index.html
    ├── app3/               ← 应用三
    │   └── index.html
    └── ...
```

### 第四步：配置应用清单

编辑 `apps.json`，修改每个应用的名称、描述、图标、颜色等：

```json
{
  "apps": [
    {
      "id": "wicketproduct",
      "name": "计件工资管理",
      "description": "员工计件工资计算与管理系统",
      "url": "apps/wicketproduct/index.html",
      "icon": "📊",
      "color": "#3b82f6",
      "sort_order": 1
    }
  ],
  "admin_email": "alonzhang76@outlook.com"
}
```

### 第五步：部署到 GitHub Pages

1. 将所有文件推送到 GitHub 仓库
2. 仓库 → **Settings** → **Pages**
3. Source 选择 `Deploy from a branch`，Branch 选择 `main` / `root`
4. 等待部署完成

## 使用说明

### 管理员登录

1. 在登录页选择"管理员"身份
2. 输入管理员邮箱 `alonzhang76@outlook.com` 和密码
3. 登录后顶部会出现"⚙ 权限管理"按钮
4. 点击按钮打开管理面板
5. 输入用户邮箱 → 点击查找 → 为每个应用设置权限 → 保存

### 权限说明

| 权限 | 说明 |
|------|------|
| 读写 (write) | 完全访问，正常使用应用 |
| 只读 (read) | 可以进入应用，卡片显示"只读"标签，URL 附带 `?perm=read` 参数 |
| 不显示 (none) | 用户看不到该应用 |

### 用户登录

1. 在登录页选择"普通用户"身份
2. 输入邮箱和密码
3. 登录后只看到管理员分配了权限的应用
4. 只读应用会在名称旁显示蓝色"只读"标签

## 修改管理员邮箱

在 Supabase SQL Editor 中执行：

```sql
create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select exists (
    select 1 from auth.users
    where id = uid
    and email = '新管理员邮箱@example.com'
  );
$$ language sql security definer stable;
```

同时记得修改 `apps.json` 中的 `admin_email` 字段。

## 安全说明

- 前端只使用 Supabase anon key，安全可靠
- 管理员写权限通过 PostgreSQL RPC 函数实现，函数内部校验管理员身份
- RLS 策略确保用户只能读取自己的权限
- 子应用建议各自也加上登录验证

## 常见问题

**Q: 登录后提示"无管理员权限"？**
A: 确认邮箱是否与 `is_admin` 函数中配置的一致，且 Supabase Auth 中有该用户。

**Q: 管理员面板查找用户时提示"函数不存在"？**
A: 说明还没执行 `setup_portal.sql` 脚本，去 Supabase SQL Editor 执行一下。

**Q: 普通用户看不到任何应用？**
A: 管理员需要先在权限管理面板中为该用户分配应用权限。

**Q: 如何新增/修改应用？**
A: 直接编辑 `apps.json` 文件即可，无需动数据库。
