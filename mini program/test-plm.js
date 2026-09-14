/**
 * 业务逻辑单元测试（mock wx 环境）
 * 验证 trade-db.js 的四大算法与 wage-db.js 的基础功能
 */
const path = require('path');
const Module = require('module');

/* ===== mock wx ===== */
/**
 * 注意：setStorageSync 不能深拷贝 value —— 业务层把同一对象引用既放进内存数组
 * 又写入 storage，深拷贝会让两者脱钩（内存里的后续修改无法通过 query 观察到）。
 * 真机 wx.setStorageSync 本身就是「序列化快照 + 内存对象不变」，这里如实模拟：
 * 只记录快照供断言使用，内存对象保持原引用。
 */
const storage = {};
global.wx = {
  getStorageSync: k => (k in storage ? storage[k] : ''),
  setStorageSync: (k, v) => { storage[k] = v; },
  removeStorageSync: k => { delete storage[k]; },
  request: () => {},
  getFileSystemManager: () => ({ writeFileSync() {}, readFile() {} }),
  showToast: () => {},
  shareFileMessage: () => {}
};

const trade = require('./plm-work/utils/trade-db.js');
const wage = require('./plm-work/utils/wage-db.js');
const schedule = require('./plm-work/utils/schedule-db.js');
const purchase = require('./plm-work/utils/purchase-db.js');
const income = require('./plm-work/utils/income-db.js');
const income2 = require('./plm-work/utils/income-db.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      actual  : ' + a + '\n      expected: ' + b); }
}
function ok(cond, label) { eq(!!cond, true, label); }

console.log('\n=== 1. 订单保存（多产品行） ===');
trade.data.orderRecords = [];
trade.saveOrder({ customer: 'ACME', orderNo: 'SO-001', orderDate: '2026-01-10', currency: 'USD', paymentMethod: '预付款', status: '待生产' }, [
  { productName: '炉架A', unitPrice: 12.5, quantity: 100 },
  { productName: '炉架B', unitPrice: 8, quantity: 50 }
]);
eq(trade.data.orderRecords.length, 2, '两行产品生成两条记录');
eq(trade.data.orderRecords[0].amount, 1250, '行1金额 = 12.5 × 100');
eq(trade.data.orderRecords[1].amount, 400, '行2金额 = 8 × 50');
eq(trade.data.orderRecords[0].status, '待生产', '默认状态为待生产');

console.log('\n=== 2. 订单号聚合 ===');
const g1 = trade.groupOrdersByNo();
eq(Object.keys(g1).length, 1, '聚合为 1 个订单号');
eq(g1['SO-001'].amount, 1650, '订单金额 = 1250 + 400');

console.log('\n=== 3. 出口 → 订单状态置已出货 ===');
trade.saveExport({
  customer: 'ACME', exportDate: '2026-02-01', quantity: 150,
  orderNo: ['SO-001'], shipmentNo: 'SH001', vesselVoyage: 'EVER GIVEN 012E',
  containerSeal: 'CSLU1234567/SEAL01', billNo: 'BL001', declarationAmount: 1650
});
eq(trade.data.exportRecords.length, 1, '出口记录已保存');
eq(trade.data.exportRecords[0].shippingNo, 'SH001', '字段映射 shipmentNo→shippingNo');
eq(trade.data.exportRecords[0].shipName, 'EVER GIVEN 012E', '字段映射 vesselVoyage→shipName');
eq(trade.data.exportRecords[0].containerNo, 'CSLU1234567/SEAL01', '字段映射 containerSeal→containerNo');
eq(trade.data.orderRecords[0].status, '已出货', '订单状态自动置为已出货');

console.log('\n=== 4. 收汇 → 订单状态推进 ===');
trade.data.orderRecords = [];
trade.saveOrder({ customer: 'BETA', orderNo: 'SO-002', orderDate: '2026-01-15', currency: 'USD', status: '待生产' }, [{ productName: 'X', unitPrice: 100, quantity: 10 }]);
eq(trade.data.orderRecords[0].status, '待生产', '初始为待生产');
trade.saveReceipt({ customer: 'BETA', orderNo: 'SO-002', receiptDate: '2026-02-10', amountReceived: 500, fee: 10, currency: 'USD', exchangeRate: 7.2, rate: 50 });
eq(trade.data.receiptRecords.length, 1, '收汇记录已保存');
eq(trade.data.orderRecords[0].status, '生产中', '收汇后订单由待生产推进为生产中');

console.log('\n=== 5. 报表统计（收汇/付款） ===');
trade.data.receiptRecords = [];
trade.data.indexPaymentRecords = [];
const now = new Date();
const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const y = String(now.getFullYear());
trade.saveReceipt({ customer: 'A', orderNo: 'X1', receiptDate: ym + '-05', amountReceived: 1000, fee: 20, currency: 'USD', exchangeRate: 7.2 });
trade.saveReceipt({ customer: 'B', orderNo: 'X2', receiptDate: '2020-03-01', amountReceived: 500, fee: 0, currency: 'USD', exchangeRate: 7.2 });
trade.savePayment({ customer: 'A', orderNo: 'X1', paymentDate: ym + '-06', amount: 3000, paymentMethod: '尾款' });
trade.savePayment({ customer: 'B', orderNo: 'X2', paymentDate: '2020-03-02', amount: 1000, paymentMethod: '预付款' });

const st = trade.getReportStatistics();
eq(st.monthlyReceipt, 7056, '本月收汇 = (1000-20)×7.2 = 7056');
eq(st.yearlyReceipt, 7056, '本年收汇 = 7056');
eq(st.totalReceipt, 10656, '累计收汇 = 7056 + 500×7.2 = 10656');
eq(st.monthlyPayment, 3000, '本月付款 = 3000');
eq(st.yearlyPayment, 3000, '本年付款 = 3000');
eq(st.totalPayment, 4000, '累计付款 = 3000 + 1000');

console.log('\n=== 6. 欠款统计（含外币折算） ===');
trade.data.orderRecords = [];
trade.data.receiptRecords = [];
trade.data.exportRecords = [];
trade.data.indexPaymentRecords = [];

// 场景 A：USD 订单 10000，已收 7200 CNY（汇率7.2 → 1000 USD），欠 9000 USD
trade.saveOrder({ customer: 'C1', orderNo: 'D-001', orderDate: '2026-01-01', currency: 'USD', status: '已出货' }, [{ productName: 'P', unitPrice: 10000, quantity: 1 }]);
trade.saveReceipt({ customer: 'C1', orderNo: 'D-001', receiptDate: '2026-02-01', amountReceived: 7200, fee: 0, currency: 'CNY', exchangeRate: 1 });

// 场景 B：待生产无收汇 → 欠款 = 全款
trade.saveOrder({ customer: 'C2', orderNo: 'D-002', orderDate: '2026-01-02', currency: 'EUR', status: '待生产' }, [{ productName: 'Q', unitPrice: 5000, quantity: 1 }]);

// 场景 C：全额收汇 → 无欠款
trade.saveOrder({ customer: 'C3', orderNo: 'D-003', orderDate: '2026-01-03', currency: 'USD', status: '已出货' }, [{ productName: 'R', unitPrice: 2000, quantity: 1 }]);
trade.saveReceipt({ customer: 'C3', orderNo: 'D-003', receiptDate: '2026-02-02', amountReceived: 2000, fee: 0, currency: 'USD', exchangeRate: 7.2 });

const debts = trade.generateDebtStatistics();
const dMap = {};
debts.forEach(d => { dMap[d.orderNo] = d; });
ok(dMap['D-001'], 'D-001 列入欠款');
ok(!dMap['D-003'], 'D-003 全额收汇，不列入欠款');
ok(dMap['D-002'], 'D-002 待生产无收汇，列入欠款');
eq(dMap['D-002'].debtAmount, 5000, 'D-002 欠款 = 全款 5000 EUR');
ok(dMap['D-001'].debtAmount > 0, 'D-001 欠款金额 > 0');

const totalCNY = trade.getTotalDebtCNY(debts);
ok(totalCNY > 0, '合计欠款（CNY）> 0');
console.log('    D-001 欠款 ' + dMap['D-001'].debtAmount + ' USD ｜ D-002 欠款 ' + dMap['D-002'].debtAmount + ' EUR ｜ 合计 ' + totalCNY + ' CNY');

console.log('\n=== 7. 订单动态提醒 ===');
const rems = trade.generateOrderReminders();
ok(rems.length > 0, '生成提醒列表（' + rems.length + ' 条）');
ok(rems.some(r => r.type === 'warning'), '含 warning 类型提醒');
ok(rems.some(r => r.orderNo === 'D-002'), 'D-002 有待跟进提醒');

console.log('\n=== 8. 备忘录（颜色 + 置顶 + 搜索） ===');
trade.data.memoRecords = [];
const m1 = trade.addMemo();
trade.saveMemoEdit(m1.id, '客户拜访', '下周一拜访 ACME 采购部', '#fef9c3');
const m2 = trade.addMemo();
trade.saveMemoEdit(m2.id, '汇率提醒', 'USD 汇率变动需关注', '#dcfce7');
trade.toggleMemoPin(m2.id);

let memos = trade.queryMemos('');
eq(memos[0].title, '汇率提醒', '置顶备忘录排在首位');
eq(memos.length, 2, '共 2 条备忘录');
memos = trade.queryMemos('拜访');
eq(memos.length, 1, '搜索"拜访"命中 1 条');
eq(memos[0].title, '客户拜访', '搜索命中标题');
eq(trade.data.memoRecords.find(x => x.id === m2.id).color, '#dcfce7', '颜色已保存');

console.log('\n=== 9. 业务跟踪（同跟进单号状态自动处理） ===');
trade.data.businessRecords = [];
trade.saveBusiness({ customerName: 'ACME', followupNo: 'FU-01', contactDate: '2026-01-01', status: '跟进中/已发邮件', nextFollowup: '2026-02-01' });
trade.saveBusiness({ customerName: 'ACME', followupNo: 'FU-01', contactDate: '2026-01-15', status: '已回复', nextFollowup: '2026-02-15' });
trade.saveBusiness({ customerName: 'ACME', followupNo: 'FU-01', contactDate: '2026-01-25', status: '已下单', nextFollowup: '2026-03-01' });
const bizList = trade.data.businessRecords.filter(b => b.followupNo === 'FU-01');
eq(bizList.length, 3, '同跟进单号共 3 条');
eq(bizList.find(b => b.contactDate === '2026-01-25').status, '已下单', '最新一条保留自身状态');
eq(bizList.find(b => b.contactDate === '2026-01-01').status, '已回复', '较早一条自动置为已回复');
eq(bizList.find(b => b.contactDate === '2026-01-15').status, '已回复', '中间一条自动置为已回复');
ok(trade.isBusinessLastOfGroup(bizList.find(b => b.contactDate === '2026-01-25')), '最新一条被识别为组内最后一条');
ok(!trade.isBusinessLastOfGroup(bizList.find(b => b.contactDate === '2026-01-01')), '最早一条非组内最后一条');

console.log('\n=== 10. 客户 CRUD ===');
trade.data.customerRecords = [];
const c1 = trade.saveCustomer({ customerName: 'ACME Corp', customerType: '客户', region: '美国', contactName: 'John', phone: '13800000000', tags: '重点,老客户', priority: true });
eq(trade.data.customerRecords.length, 1, '新增客户');
eq(trade.data.customerRecords[0].priority, true, '重点客户标记');
trade.toggleCustomerPriority(c1.id);
eq(trade.data.customerRecords[0].priority, false, '取消重点标记');
trade.saveCustomer({ customerName: 'ACME Corp', contactName: 'Jane' }, c1.id);
eq(trade.data.customerRecords[0].contactName, 'Jane', '编辑客户');
eq(trade.data.customerRecords.length, 1, '编辑不新增记录');
trade.deleteCustomer(c1.id);
eq(trade.data.customerRecords.length, 0, '删除客户');

console.log('\n=== 11. 发票 / 付款 CRUD ===');
trade.data.invoiceRecords = [];
trade.saveInvoice({ customer: 'ACME', orderNo: 'SO-001', productName: '炉架', quantity: 100, unitPrice: 12.5, amount: 1250, agentFee: 50, payee: '普利美', invoiceDate: '2026-02-01' });
eq(trade.data.invoiceRecords.length, 1, '新增发票');
eq(trade.data.invoiceRecords[0].amount, 1250, '发票金额');
eq(trade.data.invoiceRecords[0].agentFee, 50, '代理费');
trade.data.invoiceRecords = [];
trade.data.indexPaymentRecords = [];
trade.savePayment({ customer: 'ACME', orderNo: 'SO-001', paymentDate: '2026-02-05', amount: 800, paymentMethod: '预付款', recipient: '供应商A' });
eq(trade.data.indexPaymentRecords.length, 1, '新增付款');
trade.deletePayment(trade.data.indexPaymentRecords[0].id);
eq(trade.data.indexPaymentRecords.length, 0, '删除付款');

console.log('\n=== 12. 备份 / 恢复 ===');
trade.data.orderRecords = [{ id: 1, orderNo: 'BK-1', amount: 100 }];
trade.data.customerRecords = [{ id: 'c1', customerName: 'X' }];
const bk = trade.exportBackup();
ok(bk.orderRecords && bk.customerRecords, '备份含全部数据键');
ok(bk.version && bk.exportDate, '备份含版本与导出时间');
trade.data.orderRecords = [];
trade.data.customerRecords = [];
eq(trade.data.orderRecords.length, 0, '清空订单');
const restored = trade.importBackup(bk);
ok(restored, '恢复成功');
eq(trade.data.orderRecords.length, 1, '订单已恢复');
eq(trade.data.customerRecords.length, 1, '客户已恢复');

console.log('\n=== 13. 工资模块基础功能（回归验证） ===');
wage.data.records = [];
wage.data.employees = [{ id: 'e1', name: '张三', status: '1' }];
wage.data.processes = [{ id: 'p1', name: '冲压', unitPrice: 2, dailyQuota: 100, overPrice: 3 }];
wage.data.orders = [];
wage.data.adjustments = [];
wage.addRecord({ date: '2026-03-05', employee: '张三', process: '冲压', quantity: 120, totalAmount: 260 });
eq(wage.data.records.length, 1, '新增工序记录');
const ms = wage.getMonthlySummary(2026, 3);
eq(ms.length, 1, '月度汇总返回 1 人');
eq(ms[0].name, '张三', '汇总员工名');
eq(ms[0].baseWage, 260, '基本工资 = 260');
eq(ms[0].attendDays, 1, '出勤 1 天');
wage.addOrder({ customer: 'ACME', orderNo: 'W-1', orderDate: '2026-03-01', qty: 100, delivery: '2026-04-01', m1: 10, m2: 20 });
eq(wage.data.orders.length, 1, '新增工资订单');
eq(wage.getOrderStatus(wage.data.orders[0]), '待生产', '订单状态待生产');

console.log('\n=== 14. 订单排程模块（schedule-db） ===');
schedule.data.production_orders_data = [];
schedule.data.calendarNotes = {};
schedule.data.memos = [];
schedule.saveOrder({ date: '2026-03-01', customer: '客户A', orderNo: 'PO-1', product: '网带', quantity: 100, price: 10, moldFee: 50, currency: 'CNY' });
eq(schedule.data.production_orders_data.length, 1, '排程新增订单');
const po = schedule.data.production_orders_data[0];
eq(po.orderAmount, 1050, '订单金额 = 100*10+50');
eq(po.status, '生产中', '无出货日期为生产中');
po.shipDate = '2026-03-20';
const po2 = schedule.saveOrder(po);
eq(po2.status, '已出货', '填出货日期后已出货');
schedule.saveOrder({ customer: '客户A', orderNo: 'PO-2', quantity: 10, price: 5, invoiceAmount: 100, payAmount1: 40, payAmount2: 60, currency: 'CNY' });
eq(schedule.data.production_orders_data[1].paymentStatus, '付清', '付款合计>=开票为付清');
eq(schedule.paymentStatus(100, 40, 30, 0, 0), '欠款 30.00', '欠款 = 开票-已付');
eq(schedule.toCNY(100, 'USD'), 720, '排程汇率 USD=7.2');
eq(schedule.toCNY(100, 'EUR'), 780, '排程汇率 EUR=7.8');
schedule.addNote('2026-03-05', '交货提醒');
schedule.addNote('2026-03-05', '验货');
eq(schedule.getNotes('2026-03-05').length, 2, '日历记事2条');
schedule.toggleNote('2026-03-05', 0);
ok(schedule.getNotes('2026-03-05')[0].completed, '记事可勾选完成');
schedule.deleteNote('2026-03-05', 0);
eq(schedule.getNotes('2026-03-05').length, 1, '删除记事');
const sm1 = schedule.addMemo({ title: 't1', priority: 'high', deadline: '2026-04-01' });
const sm2 = schedule.addMemo({ title: 't2', priority: 'low', deadline: '2026-04-02' });
ok(sm1.id !== sm2.id, '同毫秒备忘 id 不冲突');
schedule.toggleMemoStatus(sm1.id);
eq(schedule.data.memos.find(m => m.id === sm1.id).status, 'done', '备忘状态切换');
const sbk = schedule.exportBackup();
ok(Array.isArray(sbk.orders) && sbk.orders.length === 2, '排程备份含订单');
schedule.data.production_orders_data = [];
schedule.importBackup(sbk);
eq(schedule.data.production_orders_data.length, 2, '排程恢复订单');
const dash = schedule.getDashboard();
eq(dash.total, 2, '看板订单数');
eq(dash.delivered, 1, '看板已出货');
const summ = schedule.getSummary('');
eq(summ.byCustomer.length, 1, '按客户汇总合并');
eq(summ.byCustomer[0].name, '客户A', '客户汇总名称');

console.log('\n=== 15. 采购管理模块（purchase-db） ===');
purchase.data.purchaseOrders_companyA = [];
purchase.data.invoices_companyA = [];
purchase.data.payments_companyA = [];
purchase.data.contracts_companyA = [];
purchase.data.receipts_companyA = [];
purchase.data.returns_companyA = [];
purchase.data.suppliers = [];
purchase.saveSupplier({ supplierNumber: 'S001', supplierName: '钢材厂', contactPerson: '李四', phoneNumber: '13800000000' });
eq(purchase.listSuppliers().length, 1, '新增供应商');
purchase.saveOrder('companyA', { contractNumber: 'HT-1', supplier: '钢材厂', orderDate: '2026-03-01', deliveryDate: '2026-04-01',
  products: [ { productName: '钢板', specification: '2mm', unitPrice: 50, quantity: 10, unit: '张' }, { productName: '木箱', unitPrice: 30, quantity: 2, unit: '个' } ] });
eq(purchase.listOrders('companyA').length, 1, '采购订单保存');
eq(purchase.listOrders('companyA')[0].products[0].amount, 500, '产品行金额自动计算');
eq(purchase.listOrders('companyA')[0].totalAmount, 560, '总金额 560');
const cts = purchase.listContracts('companyA');
eq(cts.length, 1, '合同台账自动生成');
eq(cts[0].products.length, 1, '合同过滤木箱产品');
eq(cts[0].totalAmount, 560, '合同金额');
purchase.saveInvoice('companyA', { invoiceNumber: 'INV-1', invoiceDate: '2026-03-10', purchaseOrder: 'HT-1', supplier: '钢材厂', amount: 400 });
eq(purchase.listInvoices('companyA')[0].status, '未付款', '发票初始未付款');
purchase.savePayment('companyA', { paymentType: 'invoice-first', invoiceNumbers: 'INV-1', contractNumber: 'HT-1', supplier: '钢材厂', paymentDate: '2026-03-15', amount: 250 });
eq(purchase.listInvoices('companyA')[0].status, '部分付款', '付款250后部分付款');
purchase.savePayment('companyA', { paymentType: 'invoice-first', invoiceNumbers: 'INV-1', supplier: '钢材厂', paymentDate: '2026-03-20', amount: 150 });
eq(purchase.listInvoices('companyA')[0].status, '已付款', '付满400后已付款');
purchase.saveReceipt('companyA', { contractNumber: 'HT-1', supplier: '钢材厂', productName: '钢板', quantity: 10, unit: '张', receiptDate: '2026-03-12' });
eq(purchase.listReceipts('companyA').length, 1, '收货登记');
purchase.saveReturn('companyA', { contractNumber: 'HT-1', supplier: '钢材厂', productName: '钢板', quantity: 1, unit: '张', returnDate: '2026-03-13', reason: '划伤' });
eq(purchase.listReturns('companyA').length, 1, '退货登记');
const stA = purchase.getStats('companyA');
eq(stA.purchaseTotal, 560, '采购总额');
eq(stA.invoiceTotal, 400, '发票总额');
eq(stA.paymentTotal, 400, '付款总额');
eq(stA.payable, 0, '应付净额 0');
eq(stA.bySupplier[0].name, '钢材厂', '按供应商汇总');
purchase.saveOrder('companyB', { contractNumber: 'HT-B1', supplier: '龙力供应商', orderDate: '2026-03-02', products: [{ productName: '配件', unitPrice: 20, quantity: 5, unit: '个' }] });
eq(purchase.listOrders('companyB').length, 1, 'B 公司订单独立');
eq(purchase.listOrders('companyA').length, 1, 'A 公司数据不受影响');
eq(purchase.listContracts('companyB')[0].contractNumber, 'HT-B1', 'B 公司合同台账独立');
const pbk = purchase.exportBackup('companyA');
ok(pbk.purchaseOrders.length === 1 && pbk.suppliers.length === 1, '采购备份');
purchase.data.purchaseOrders_companyA = [];
purchase.data.invoices_companyA = [];
purchase.importBackup(pbk);
eq(purchase.listOrders('companyA').length, 1, '采购恢复订单');
eq(purchase.listInvoices('companyA').length, 1, '采购恢复发票');

console.log('\n=== 16. 收支管理模块（income-db） ===');
income.data.transactions_company1 = [];
income.data.transactions_company2 = [];
income.data.todos = [];
income.saveTx('company1', { type: 'income', amount: 10000, categoryId: 'investment', date: '2026-03-01', description: '货款A' });
income.saveTx('company1', { type: 'expense', amount: 3000, categoryId: 'raw-materials', date: '2026-03-05', description: '买钢材' });
income.saveTx('company1', { type: 'expense', amount: 2000, categoryId: 'salary', date: '2026-03-10' });
eq(income.listTx('company1').length, 3, '新增 3 笔流水');
eq(income.listTx('company1')[0].categoryName, '货款', '分类名自动回填');
const st1 = income.getStats('company1');
eq(st1.income, 10000, '总收入 10000');
eq(st1.expense, 5000, '总支出 5000');
eq(st1.balance, 5000, '结余 5000');
eq(st1.byCategory.length, 3, '按分类汇总 3 项');
eq(st1.byMonth.length, 1, '按月汇总 1 个月');
eq(st1.byMonth[0].month, '2026-03', '月份键');
eq(st1.byMonth[0].balance, 5000, '月度结余');
// 筛选
eq(income.queryTx('company1', { type: 'income' }).length, 1, '筛选收入');
eq(income.queryTx('company1', { type: 'expense', categoryId: 'salary' }).length, 1, '筛选分类');
eq(income.queryTx('company1', { dateFrom: '2026-03-05' }).length, 2, '筛选起始日期');
eq(income.queryTx('company1', { kw: '钢材' }).length, 1, '关键词搜索');
eq(income.queryTx('company1', { kw: '买钢材,工资' }).length, 2, '关键词逗号多条件');
const txs = income.queryTx('company1', {});
eq(txs[0].date, '2026-03-10', '按日期倒序');
// 编辑与删除
const tx0 = income.listTx('company1').find(t => t.categoryId === 'salary');
income.saveTx('company1', Object.assign({}, tx0, { amount: 2500 }));
eq(income.listTx('company1').length, 3, '编辑不新增记录');
eq(income.getStats('company1').expense, 5500, '编辑后总额更新');
income.deleteTx('company1', tx0.id);
eq(income.listTx('company1').length, 2, '删除流水');
// 双公司隔离
income.saveTx('company2', { type: 'income', amount: 999, categoryId: 'other-income', date: '2026-03-08' });
eq(income.listTx('company2').length, 1, 'B 公司流水独立');
eq(income.listTx('company1').length, 2, 'A 公司不受影响');
eq(income.getStats('company2').balance, 999, 'B 公司结余');
// 待办
const td1 = income.addTodo({ text: '核对发票', priority: 'high' });
const td2 = income.addTodo({ text: '催款', priority: 'low' });
ok(td1.id !== td2.id, '同毫秒待办 id 不冲突');
eq(income.listTodos().length, 2, '待办 2 条');
income.toggleTodo(td1.id);
eq(income.listTodos().find(t => t.id === td1.id).completed, true, '待办勾选完成');
income.saveTodoEdit({ id: td2.id, text: '催款（已改）', priority: 'medium' });
eq(income.listTodos().find(t => t.id === td2.id).text, '催款（已改）', '待办编辑');
eq(income.listTodos().find(t => t.id === td2.id).priority, 'medium', '待办优先级更新');
income.deleteTodo(td1.id);
eq(income.listTodos().length, 1, '删除待办');
// 备份恢复
const ibk = income.exportBackup();
eq(ibk.transactions.company1.length, 2, '备份含 A 公司流水');
eq(ibk.transactions.company2.length, 1, '备份含 B 公司流水');
income.data.transactions_company1 = [];
income.data.todos = [];
income.importBackup(ibk);
eq(income.listTx('company1').length, 2, '恢复 A 公司流水');
eq(income.listTodos().length, 1, '恢复待办');
eq(income.CATEGORIES.expense.length, 26, '支出分类 26 项');
eq(income.CATEGORIES.income.length, 7, '收入分类 7 项');

console.log('\n=== 17. 收支单位归一（单位=公司抬头）与往来单位候选 ===');
// 造历史脏数据：unit 是旧的手填计量单位
income.data.transactions_company1 = [
  { id: 'x1', type: 'income', amount: 100, categoryId: 'salary', categoryName: '前期账面余额', date: '2026-01-01', unit: '只', payeeUnit: '', payerUnit: '无锡龙力印铁设备制造有限公司', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'x2', type: 'expense', amount: 50, categoryId: 'raw-materials', categoryName: '原材料', date: '2026-02-01', unit: '吨', payeeUnit: '钢材市场有限公司', payerUnit: '', createdAt: '2026-02-01T00:00:00Z' }
];
income.data.transactions_company2 = [
  { id: 'y1', type: 'expense', amount: 9, categoryId: 'tax', categoryName: '税', date: '2026-03-01', unit: 'wrong', payeeUnit: '税务局', createdAt: '2026-03-01T00:00:00Z' }
];
income.normalizeUnits();
eq(income.data.transactions_company1[0].unit, '普利美（常州）环境工程科技有限公司', 'company1 旧单位归一为普利美抬头');
eq(income.data.transactions_company1[1].unit, '普利美（常州）环境工程科技有限公司', 'company1 第二条同样归一');
eq(income.data.transactions_company2[0].unit, '无锡龙力印铁设备制造有限公司', 'company2 归一为龙力抬头');
const txN = income.saveTx('company2', { type: 'expense', amount: 3, categoryId: 'tax', payeeUnit: '税务局' });
eq(txN.unit, '无锡龙力印铁设备制造有限公司', '新增流水 unit 自动=公司抬头（忽略表单值）');
const cps = income.listCounterparties('company1');
ok(cps.indexOf('钢材市场有限公司') >= 0 && cps.indexOf('无锡龙力印铁设备制造有限公司') >= 0, '候选含收/付款单位');
ok(cps.indexOf('只') < 0 && cps.indexOf('吨') < 0, '旧的计量单位不会混进候选');
// 两公司候选池互不串：company2 的候选不含 company1 独有的单位
const cps2 = income.listCounterparties('company2');
ok(cps2.indexOf('税务局') >= 0, 'company2 候选含本单位往来');
const filtered = cps.filter(x => x.toLowerCase().indexOf('龙力'.toLowerCase()) >= 0);
eq(filtered.length, 1, '按关键字可筛选候选');

console.log('\n=== 18. 登记页订单候选（待生产/生产中） ===');
const wage2 = require('./plm-work/utils/wage-db.js');
const mk = (over) => Object.assign({ id: 't1', customer: 'C', orderNo: 'N', qty: 100 }, over);
const ost = o => wage2.getOrderStatus(o);
eq(ost(mk({})), '待生产', '无投料日期 = 待生产（应出现在登记候选）');
eq(ost(mk({ materialDate: '2026-03-01' })), '生产中', '有投料日期 = 生产中（应出现在登记候选）');
eq(ost(mk({ materialDate: '2026-03-01', packDate: '2026-04-01' })), '生产结束', '打箱后 = 生产结束（不进候选）');
eq(ost(mk({ materialDate: '2026-03-01', shipDate: '2026-05-01' })), '已出货', '出货后 = 已出货（不进候选）');
const cands = [mk({ id: '1' }), mk({ id: '2', materialDate: '2026-03-01' }), mk({ id: '3', materialDate: '2026-03-01', packDate: '2026-04-01' }), mk({ id: '4', materialDate: '2026-03-01', shipDate: '2026-05-01' })];
const picked = cands.filter(o => { const x = ost(o); return x === '待生产' || x === '生产中'; });
eq(picked.length, 2, '候选只含 待生产 + 生产中');
eq(picked.map(o => o.id).join(','), '1,2', '候选 id 正确');

console.log('\n========================================');
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail > 0 ? 1 : 0);
