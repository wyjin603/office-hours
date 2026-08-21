# Office Hours & Lab Booking

一个放在 **GitHub Pages** 上的静态预约页面（界面全英文）：学生打开网址 → 点一个 15 分钟的空格子 →
填名字 → 提交。预约数据写进**你自己的 Google 表格**，你随时能看、能导出。学生不需要任何账号。

- 每个 15 分钟格子只能 1 个人，被约走后其他人看到 `Booked · <名字>` 并且点不动
- 预约成功给一个 6 位取消码，学生可以自己取消（同一台设备上会自动记住，直接点 Cancel 即可）
- 时段支持**每周固定重复** + **临时指定的具体日期**（用 `label` 区分 Office Hour / Lab）
- 全部免费，不需要服务器

---

## 一、先看效果（不用配置任何东西）

```bash
python3 -m http.server 8000 --directory /Users/wyjin/Documents/Stock/office-hours
```

浏览器打开 <http://localhost:8000> 。这时是**演示模式**（顶部有黄色 "Demo mode" 提示）：
能点、能填、能取消，但数据只存在你这台电脑的浏览器里。配好后端之后就变成真的了。

---

## 二、建后端（Google 表格 + Apps Script，约 5 分钟）

### 1. 打开脚本编辑器

**在你那个表格页面上**点菜单 **Extensions → Apps Script**（中文界面是「扩展程序 → Apps Script」）。
这样脚本才会绑定到表格。

> 如果你已经从 <https://script.google.com> 单独建了个空项目也没关系 —— 见下面第 3 步的 `SPREADSHEET_ID`。

### 2. 粘贴代码

把编辑器里原有的 `function myFunction() {}` **全选删掉**，粘贴 [`apps-script/Code.gs`](apps-script/Code.gs) 的全部内容。

一键复制到剪贴板：

```bash
cat /Users/wyjin/Documents/Stock/office-hours/apps-script/Code.gs | pbcopy
```

### 3. 改两个变量（在文件最上面）

```js
var SPREADSHEET_ID = '';   // 从表格的 Extensions 菜单打开的 → 留空
                           // 从 script.google.com 单独建的 → 填表格网址里 /d/ 和 /edit 之间那串 ID
var NOTIFY_EMAIL   = '';   // 填你的邮箱 = 每次有人预约/取消都发一封提醒信；留空则不发
```

### 4. 授权

点保存 💾 → 顶部函数下拉框选 **`setup`** → 点 ▶ **Run**。
第一次会弹授权：选你的 Google 账号 → **Advanced（高级）** → **Go to …(unsafe)（转至…不安全）** → **Allow**。

（"unsafe" 是因为脚本没经过 Google 审核 —— 这是你自己的脚本，正常现象。）

运行完看底部 Execution log，应该打印 `OK. Sheet ready: "Bookings" in "<你的表格名>"`，
同时表格里会多出一个 `Bookings` 工作表。**看到这行才算成功。**

### 5. 部署成网页应用

右上角 **Deploy → New deployment**：

| 项 | 选什么 |
|---|---|
| 类型（齿轮图标） | **Web app** |
| Execute as | **Me（你的邮箱）** |
| Who has access | **Anyone** ← 必须是这个 |

> 选成 "Anyone with Google account" 的话，没登录 Google 的学生会被拦在外面。

点 Deploy，复制 **Web app URL**（形如 `https://script.google.com/macros/s/AKfycb.../exec`）。

### 6. 填回前端

打开 [`config.js`](config.js)，把 `apiUrl: 'DEMO'` 换成刚才的网址：

```js
apiUrl: 'https://script.google.com/macros/s/AKfycb..../exec',
```

刷新网页，黄色 "Demo mode" 提示消失 = 连上了。

> **以后每次改 `Code.gs` 都要重新部署**：Deploy → Manage deployments → 铅笔图标 → Version 选 **New version** → Deploy。
> 光按保存是不会生效的。这是最常见的坑。

---

## 三、开启 Google Meet 自动生成（线上 office hour 用）

学生选「Online」预约时，后端会在**你的 Google 日历**上建一个日程、自动生成一条 Meet 链接，
当场显示给学生；学生填了邮箱的话还会收到日历邀请。学生取消时，日程自动删除。

这需要在 Apps Script 里多启用一个服务：

1. 编辑器左侧 **「服务 / Services」** 旁边的 **➕**
2. 列表里选 **Google Calendar API** → **添加**（标识符保持默认的 `Calendar`）
3. 保存，然后运行一次 **`setup`**，看「执行日志」：

```
✅ 表格 OK：工作表 "Bookings" in "Office Hour Appointment"
✅ 日历 OK：<你的日历名>（时区 America/New_York）
   Meet 链接生成：开
```

两行都是 ✅ 才算配好。如果第二行是 ❌，说明 Calendar 服务没加上 —— 这种情况**预约照样能成功**，
只是没有 Meet 链接（代码里做了兜底，不会因为日历没配好就挡住学生预约）。

4. 最后 **重新部署**（Deploy → 管理部署 → 铅笔 → 版本选「新版本」→ 部署）。

`Code.gs` 顶部这几个开关可以调：

```js
var TIMEZONE          = 'America/New_York';  // ⚠️ 必须和 config.js 的 timezone 一致
var ADD_TO_CALENDAR   = true;   // 每个预约都在你日历上建日程（线下的也建，方便你看）
var CREATE_MEET_LINK  = true;   // 线上预约生成 Meet 链接
var CALENDAR_ID       = 'primary';
var EVENT_TITLE       = 'Office Hour';
var IN_PERSON_PLACE   = '';     // 线下地点，写进日程的 location
```

> **为什么不是 Zoom**：Zoom 要每次生成新会议的话，得在 Zoom Marketplace 建一个
> Server-to-Server OAuth app 拿凭证，学校账号通常需要 IT 批准。Google Meet 这条路
> Apps Script 原生支持，零额外凭证。如果你就是想用 Zoom，最省事的办法是把你的
> 个人会议室（PMI）链接固定写在 `config.js` 的 `footerNote` 里。

---

## 四、设置你的时段（改 `config.js`）

```js
title: 'Office Hours & Lab Booking',   // 页面大标题
timezone: 'America/New_York',          // 时区
use12Hour: true,                       // true → 4:00 – 4:15 PM；false → 16:00–16:15
daysAhead: 21,                         // 往后开放三周
minLeadMinutes: 60,                    // 开始前 1 小时截止预约
showNames: true,                       // 是否公开显示预约人姓名
askEmail: true,                        // 填了邮箱 → 学生收到带 Meet 链接的日历邀请

meeting: {
  defaultMode: 'either',               // 'online' 全线上 | 'inperson' 全线下 | 'either' 学生自己选
  location: 'Wachman Hall 1015',       // 线下地点，显示给学生
},

// 每周固定的（0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat）
// 时间一律写 24 小时制，显示时自动转 12 小时
// 加 mode 可以把某个时段钉死成线上或线下
recurring: [
  { weekday: 2, start: '16:00', end: '18:00', label: 'Office Hour' },
  { weekday: 4, start: '16:00', end: '18:00', label: 'Office Hour', mode: 'inperson' },
],

// 临时加的具体日期，比如实验
extraDates: [
  { date: '2026-09-10', start: '09:00', end: '12:00', label: 'Lab Session', mode: 'inperson' },
],

// 放假/出差，整天关闭
blackoutDates: ['2026-11-26'],
```

`defaultMode: 'either'` 时，学生在预约弹窗里自己选 Online 还是 In person；
给某个 `recurring` / `extraDates` 加上 `mode`，那个时段就固定成一种，格子上会直接标出来。

一段连续时间会自动切成 15 分钟的小格。`label` 显示在空格子上，所以**区分 Office Hour 和实验就靠它**。

---

## 五、发布到 GitHub Pages

```bash
git init -b main && git add -A && git commit -m "Office hours booking site"
```

去 <https://github.com/new> 建一个**公开**仓库（比如 `office-hours`），然后：

```bash
git remote add origin https://github.com/你的用户名/office-hours.git && git push -u origin main
```

仓库页面 → **Settings → Pages → Source** 选 `Deploy from a branch`，分支 `main`、目录 `/ (root)`，保存。
一两分钟后网址就是：

```
https://你的用户名.github.io/office-hours/
```

把这个网址发给学生。以后改时段：改 `config.js` → `git add -A && git commit -m "update slots" && git push`。

---

## 六、日常使用

- **看谁约了什么**：直接看 Google 表格的 `Bookings` 工作表。`status = active` 的才算数，
  `cancelled` 是已取消的记录（留痕，不占位）。
- **帮学生取消**：把那行的 `status` 从 `active` 改成 `cancelled`，学生页面刷新后格子就空出来了。
- **手动加一条预约**：补一行，`slotId` 写成 `2026-09-10_09:00` 这种格式，`status` 写 `active`。
- **学生换设备要取消**：让他输入预约时拿到的 6 位取消码；或者你直接在表里改。
- **Meet 链接在哪**：表格 `meetUrl` 列，同时也在你 Google 日历对应的日程里。
- **你在表里手动改 `status` 不会删日历日程** —— 需要的话去日历里手动删。走网页取消才会自动删。

---

## 七、隐私 & 注意事项

- **表格别开公开共享**。学生姓名存在里面，右上角 Share → General access 设成 **Restricted**（仅限特定人员）。
  学生通过网页提交时走的是 Apps Script（以你的身份写入），他们本来就不需要表格权限。
- **别把 `SPREADSHEET_ID` 推到公开仓库**。脚本本来只需要活在 Apps Script 里，仓库里这份留空就行。
- 页面默认显示已预约学生的姓名。不想显示就把 `showNames` 改成 `false`，格子只显示 `Booked`。
- **公开接口只返回姓名和线上/线下**。备注、邮箱、取消码、Meet 链接都不会出现在公开数据里 ——
  Meet 链接只在预约成功那一刻给到本人，之后存在他自己浏览器里。
- Apps Script 免费额度对一门课完全够用（每天几万次请求、100 封邮件）。
- 取消码存在浏览器 `localStorage`，清了浏览器数据就要手动输码。

---

## 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 页面结构（英文） |
| `config.js` | **你唯一需要经常改的文件**：标题、时段、时区、后端地址 |
| `app.js` | 前端逻辑（生成格子、调后端、弹窗） |
| `styles.css` | 样式（自动适配深色模式和手机） |
| `apps-script/Code.gs` | 粘到 Google Apps Script 的后端 |
| `.nojekyll` | 让 GitHub Pages 原样发布 |
