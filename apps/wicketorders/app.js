// 存储管理对象
const storage = {
    // 初始化存储结构
    init() {
        if (!localStorage.orderRecords) {
            localStorage.orderRecords = JSON.stringify([]);
        }
        if (!localStorage.exportRecords) {
            localStorage.exportRecords = JSON.stringify([]);
        }
        if (!localStorage.receiptRecords) {
            localStorage.receiptRecords = JSON.stringify([]);
        }
        if (!localStorage.invoiceRecords) {
            localStorage.invoiceRecords = JSON.stringify([]);
        }
        if (!localStorage.indexPaymentRecords) {
            localStorage.indexPaymentRecords = JSON.stringify([]);
        }
        if (!localStorage.customerRecords) {
            localStorage.customerRecords = JSON.stringify([]);
        }
        if (!localStorage.memoRecords) {
            localStorage.memoRecords = JSON.stringify([]);
        }
    },
    
    // 获取订单记录
    get orderRecords() {
        return JSON.parse(localStorage.orderRecords || '[]');
    },
    
    // 设置订单记录
    set orderRecords(records) {
        localStorage.orderRecords = JSON.stringify(records);
    },
    
    // 获取出口记录
    get exportRecords() {
        return JSON.parse(localStorage.exportRecords || '[]');
    },
    
    // 设置出口记录
    set exportRecords(records) {
        localStorage.exportRecords = JSON.stringify(records);
    },
    
    // 获取收汇记录
    get receiptRecords() {
        return JSON.parse(localStorage.receiptRecords || '[]');
    },
    
    // 设置收汇记录
    set receiptRecords(records) {
        localStorage.receiptRecords = JSON.stringify(records);
    },
    
    // 获取开票记录
    get invoiceRecords() {
        return JSON.parse(localStorage.invoiceRecords || '[]');
    },
    
    // 设置开票记录
    set invoiceRecords(records) {
        localStorage.invoiceRecords = JSON.stringify(records);
    },
    
    // 获取付款记录
    get paymentRecords() {
        return JSON.parse(localStorage.indexPaymentRecords || '[]');
    },
    
    // 设置付款记录
    set paymentRecords(records) {
        localStorage.indexPaymentRecords = JSON.stringify(records);
    },
    
    // 获取客户记录
    get customerRecords() {
        return JSON.parse(localStorage.customerRecords || '[]');
    },
    
    // 设置客户记录
    set customerRecords(records) {
        localStorage.customerRecords = JSON.stringify(records);
    },
    
    // 获取备忘录记录
    get memoRecords() {
        return JSON.parse(localStorage.memoRecords || '[]');
    },
    
    // 设置备忘录记录
    set memoRecords(records) {
        localStorage.memoRecords = JSON.stringify(records);
    },
    
    // 获取所有订单记录
    getOrderRecords() {
        return this.orderRecords;
    },
    
    // 获取所有出口记录
    getExportRecords() {
        return this.exportRecords;
    },
    
    // 获取所有收汇记录
    getReceiptRecords() {
        return this.receiptRecords;
    },
    
    // 获取所有开票记录
    getInvoiceRecords() {
        return this.invoiceRecords;
    },
    
    // 获取所有备忘录记录
    getMemoRecords() {
        return this.memoRecords;
    },
    
    // 获取所有付款记录
    getPaymentRecords() {
        return this.paymentRecords;
    },
    
    // 获取所有客户记录
    getCustomerRecords() {
        return this.customerRecords;
    },
    
    // 保存所有记录
    saveAll() {
        // 这里不需要额外操作，因为设置器已经自动保存到localStorage
    },
    
    // 添加订单记录
    addOrderRecord(record) {
        const records = this.orderRecords;
        records.push(record);
        this.orderRecords = records;
    },
    
    // 更新订单记录
    updateOrderRecord(id, updatedRecord) {
        const records = this.orderRecords;
        const index = records.findIndex(record => record.id === id);
        if (index !== -1) {
            records[index] = { ...records[index], ...updatedRecord };
            this.orderRecords = records;
            return true;
        }
        return false;
    },
    
    // 删除订单记录
    deleteOrderRecord(id) {
        const records = this.orderRecords;
        const newRecords = records.filter(record => record.id !== id);
        if (newRecords.length < records.length) {
            this.orderRecords = newRecords;
            return true;
        }
        return false;
    },
    
    // 添加出口记录
    addExportRecord(record) {
        const records = this.exportRecords;
        records.push(record);
        this.exportRecords = records;
    },
    
    // 添加收汇记录
    addReceiptRecord(record) {
        const records = this.receiptRecords;
        records.push(record);
        this.receiptRecords = records;
    },
    
    // 更新收汇记录
    updateReceiptRecord(id, updatedRecord) {
        const records = this.receiptRecords;
        const index = records.findIndex(record => record.id === id);
        if (index !== -1) {
            records[index] = { ...records[index], ...updatedRecord };
            this.receiptRecords = records;
            return true;
        }
        return false;
    },
    
    // 删除收汇记录
    deleteReceiptRecord(id) {
        const records = this.receiptRecords;
        const newRecords = records.filter(record => record.id !== id);
        if (newRecords.length < records.length) {
            this.receiptRecords = newRecords;
            return true;
        }
        return false;
    },
    
    // 添加开票记录
    addInvoiceRecord(record) {
        const records = this.invoiceRecords;
        // 生成唯一ID
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        record.id = id;
        records.push(record);
        this.invoiceRecords = records;
    },
    
    // 添加付款记录
    addPaymentRecord(record) {
        const records = this.paymentRecords;
        // 生成唯一ID
        const id = Date.now().toString();
        record.id = id;
        records.push(record);
        this.paymentRecords = records;
    },
    
    // 过滤出口记录
    filterExportRecords(filters) {
        return this.exportRecords.filter(record => {
            return (!filters.customer || record.customer.includes(filters.customer)) &&
                   (!filters.contractNo || record.contractNo.includes(filters.contractNo)) &&
                   (!filters.orderNo || record.orderNo.includes(filters.orderNo));
        });
    }
};

// 分页管理类
class Pagination {
    constructor(data = [], pageSize = 10) {
        this.data = data;
        this.filteredData = data;
        this.pageSize = pageSize;
        this.currentPage = 1;
        this.totalItems = data.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
    }
    
    // 设置数据
    setData(data) {
        this.data = data;
        this.filteredData = data;
        this.totalItems = data.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
        this.currentPage = 1;
    }
    
    // 更新数据（不重置当前页）
    updateData(data) {
        this.data = data;
        this.filteredData = data;
        this.totalItems = data.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
        this.currentPage = Math.min(this.currentPage, this.totalPages);
    }
    
    // 设置过滤后的数据
    setFilteredData(data) {
        this.filteredData = data;
        this.totalItems = data.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
        this.currentPage = Math.min(this.currentPage, this.totalPages);
    }
    
    // 设置过滤后的数据（重置当前页）
    setFilteredDataWithReset(data) {
        this.filteredData = data;
        this.totalItems = data.length;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
        this.currentPage = 1;
    }
    
    // 设置每页显示条数
    setPageSize(size) {
        this.pageSize = size;
        this.totalPages = Math.max(1, Math.ceil(this.totalItems / this.pageSize));
        this.currentPage = Math.min(this.currentPage, this.totalPages);
    }
    
    // 跳转到指定页
    goToPage(page) {
        this.currentPage = Math.max(1, Math.min(page, this.totalPages));
    }
    
    // 获取当前页数据
    getCurrentPageData() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        return this.filteredData.slice(startIndex, endIndex);
    }
    
    // 获取分页信息
    getPaginationInfo() {
        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(this.currentPage * this.pageSize, this.totalItems);
        
        return {
            currentPage: this.currentPage,
            totalPages: this.totalPages,
            pageSize: this.pageSize,
            totalItems: this.totalItems,
            startIndex: startIndex,
            endIndex: endIndex
        };
    }
    
    // 上一页
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
        }
    }
    
    // 下一页
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
        }
    }
    
    // 第一页
    firstPage() {
        this.currentPage = 1;
    }
    
    // 最后一页
    lastPage() {
        this.currentPage = this.totalPages;
    }
}

// 分页实例对象
const paginations = {
    order: new Pagination([], 10),
    export: new Pagination([], 10),
    receipt: new Pagination([], 10),
    invoice: new Pagination([], 10),
    payment: new Pagination([], 10),
    customer: new Pagination([], 9),
    business: new Pagination([], 50)
};

// 订单跨页选中状态：保存选中订单的ID，分页切换时保留选中状态
const selectedOrderIds = new Set();

// 页面控制器类
class PageController {
    constructor() {
        this.currentActiveTab = 'order';
        // 排序状态管理
        this.sortState = {
            order: {
                column: 'orderDate', // 默认按订单日期排序
                direction: 'desc' // 默认倒序排列
            },
            receipt: {
                column: 'receiptDate', // 默认按收汇日期排序
                direction: 'desc' // 默认倒序排列
            },
            export: {
                column: 'exportDate', // 默认按出货日期排序
                direction: 'desc' // 默认倒序排列
            },
            invoice: {
                column: 'invoiceDate', // 默认按开票日期排序
                direction: 'desc' // 默认倒序排列
            },
            payment: {
                column: 'paymentDate', // 默认按付款日期排序
                direction: 'desc' // 默认倒序排列
            },
            business: {
                column: 'followupNo', // 默认按跟进单号排序
                direction: 'desc' // 默认倒序排列
            }
        };
    }
    
    // 切换标签页
    switchTab(tabName) {
        // 隐藏所有内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        // 移除所有导航项的激活状态
        document.querySelectorAll('.nav-tab').forEach(item => {
            item.classList.remove('active');
        });
        
        // 显示当前标签页内容
        const currentContent = document.getElementById(`${tabName}Tab`);
        if (currentContent) {
            currentContent.classList.remove('hidden');
        }
        
        // 设置当前导航项为激活状态
        const currentNavItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (currentNavItem) {
            currentNavItem.classList.add('active');
        }
        
        // 更新当前激活标签
        this.currentActiveTab = tabName;
        
        // 根据标签页渲染对应的数据
        if (tabName === 'order') {
            // 设置默认按订单日期倒序排列
            this.sortState.order.column = 'orderDate';
            this.sortState.order.direction = 'desc';
            this.renderOrderTable();
            // 重新初始化订单表格全选功能，确保事件监听器正确添加
            initOrderTableSelectAll();
        } else if (tabName === 'export') {
            // 设置默认按出货日期倒序排列
            this.sortState.export.column = 'exportDate';
            this.sortState.export.direction = 'desc';
            this.renderExportTable();
        } else if (tabName === 'receipt') {
            // 设置默认按收汇日期倒序排列
            this.sortState.receipt.column = 'receiptDate';
            this.sortState.receipt.direction = 'desc';
            this.renderReceiptTable();
            // 重新初始化收汇管理表格全选功能
            initReceiptTableSelectAll();
            // 更新客户下拉框选项
            updateReceiptCustomerOptions();
        } else if (tabName === 'invoice') {
            // 设置默认按开票日期倒序排列
            this.sortState.invoice.column = 'invoiceDate';
            this.sortState.invoice.direction = 'desc';
            this.renderInvoiceTable();
            // 重新初始化发票管理表格全选功能
            initInvoiceTableSelectAll();
        } else if (tabName === 'payment') {
            // 设置默认按付款日期倒序排列
            this.sortState.payment.column = 'paymentDate';
            this.sortState.payment.direction = 'desc';
            this.renderPaymentTable();
            // 重新初始化账务管理表格全选功能
            initPaymentTableSelectAll();
        } else if (tabName === 'customer') {
            // 确保先从localStorage获取最新数据
            const latestRecords = storage.getCustomerRecords();
            paginations.customer.updateData(latestRecords);
            this.renderCustomerTable();
            // 重新初始化搜索功能，确保事件监听器正确添加
            initCustomerSearch();
            // 重新初始化标签筛选功能
            initCustomerTagFilter();
        } else if (tabName === 'memo') {
            // 渲染备忘录列表
            renderMemoList();
        } else if (tabName === 'business') {
            // 切换到业务跟踪时重新加载列表（确保显示云端同步后的最新数据）
            if (typeof loadBusinessList === 'function') {
                loadBusinessList();
            }
        } else if (tabName === 'report') {
            // 更新报表统计数据
            updateReportStatistics();
        }
    }
    
    // 渲染订单表格
    renderOrderTable(filteredData = null) {
        let dataToUse;
        let shouldResetPage = false;
        let isFiltered = false;
        
        // 如果传入了过滤后的数据，标记筛选状态
        if (filteredData) {
            isFiltered = true;
            dataToUse = filteredData;
            shouldResetPage = true;
        } else {
            // 检查是否处于过滤状态（当filteredData和data长度不同时，说明经过了筛选）
            isFiltered = paginations.order.filteredData.length !== paginations.order.data.length;
            // 没有传入过滤数据时
            if (isFiltered) {
                // 如果处于过滤状态，继续使用过滤后的数据
                dataToUse = paginations.order.filteredData;
            } else {
                // 否则，使用原始数据
                // 如果当前过滤数据为空，从storage获取最新数据并初始化
                if (paginations.order.filteredData.length === 0) {
                    const latestRecords = storage.getOrderRecords();
                    // 分别设置data和filteredData
                    paginations.order.data = latestRecords;
                    paginations.order.filteredData = latestRecords;
                    paginations.order.totalItems = latestRecords.length;
                    paginations.order.totalPages = Math.max(1, Math.ceil(latestRecords.length / paginations.order.pageSize));
                    paginations.order.currentPage = 1;
                    dataToUse = latestRecords;
                    shouldResetPage = true;
                } else {
                    // 否则使用当前的数据
                    dataToUse = paginations.order.data;
                }
            }
        }
        
        // 应用排序
        const sortedData = this.applySort(dataToUse, this.sortState.order);
        
        // 设置过滤后的数据
        paginations.order.filteredData = sortedData;
        paginations.order.totalItems = sortedData.length;
        paginations.order.totalPages = Math.max(1, Math.ceil(sortedData.length / paginations.order.pageSize));
        if (shouldResetPage || paginations.order.currentPage > paginations.order.totalPages) {
            paginations.order.currentPage = 1;
        }
        
        const pagination = paginations.order;
        const currentPageData = pagination.getCurrentPageData();
        const tableBody = document.getElementById('orderTableBody');
        const paginationContainer = document.getElementById('orderPagination');
        
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        // 更新表头排序状态
        this.updateOrderTableHeaderSortState();
        
        // 更新统计数据
        const orderCountWrapper = document.getElementById('orderCountWrapper');
        if (orderCountWrapper) {
            // 计算数量合计（基于当前显示的数据，即filteredData）
            const totalQuantity = paginations.order.filteredData.reduce((total, order) => {
                const quantity = parseFloat(order.quantity || 0);
                return total + (isNaN(quantity) ? 0 : quantity);
            }, 0);
            
            // 计算金额合计（基于当前显示的数据，即filteredData）
            const totalAmount = paginations.order.filteredData.reduce((total, order) => {
                const amount = parseFloat(order.amount || 0);
                return total + (isNaN(amount) ? 0 : amount);
            }, 0);
            
            // 计算已勾选记录的金额合计
            const selectedAmount = calculateSelectedOrderAmount();
            
            // 始终显示筛选后的订单数量、数量合计和金额合计
            orderCountWrapper.innerHTML = `订单数量: <strong>${pagination.totalItems}</strong> <span class="text-gray-500">|</span> 数量合计: <strong>${totalQuantity.toFixed(2)}</strong> <span class="text-gray-500">|</span> 金额合计: <strong>${totalAmount.toFixed(2)}</strong>` + (selectedAmount > 0 ? ` <span class="text-gray-500">|</span> 已勾选金额合计: <strong style="color: #059669;">${selectedAmount.toFixed(2)}</strong>` : '');
        }
        
        if (currentPageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="20" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
        } else {
            // 格式化日期函数 - 处理各种日期格式，使用本地时间避免时区偏移
            const formatDate = (dateString) => {
                if (!dateString) return '';
                
                // 直接处理字符串格式的日期
                if (typeof dateString === 'string') {
                    // 处理其他可能的日期格式
                    const dateMatch = dateString.match(/^(\d{4}-\d{2}-\d{2})/);
                    if (dateMatch) {
                        return dateMatch[1];
                    }
                    
                    // 处理数值格式的日期（如Excel日期）
                    const numDate = parseFloat(dateString);
                    if (!isNaN(numDate)) {
                        // Excel实际上是从1899年12月30日开始计算日期，所以天数差应该是25568而不是25569
                        // 然后再减去一天，确保日期显示正确
                        const jsDate = new Date((numDate - 25568) * 86400000);
                        jsDate.setDate(jsDate.getDate() - 1); // 减去一天
                        // 使用本地时间构建日期字符串，避免时区转换
                        const year = jsDate.getFullYear();
                        const month = String(jsDate.getMonth() + 1).padStart(2, '0');
                        const day = String(jsDate.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    }
                } else if (typeof dateString === 'number') {
                    // 处理数值类型的日期
                    // Excel实际上是从1899年12月30日开始计算日期，所以天数差应该是25568而不是25569
                    // 然后再减去一天，确保日期显示正确
                    const jsDate = new Date((dateString - 25568) * 86400000);
                    jsDate.setDate(jsDate.getDate() - 1); // 减去一天
                    // 使用本地时间构建日期字符串，避免时区转换
                    const year = jsDate.getFullYear();
                    const month = String(jsDate.getMonth() + 1).padStart(2, '0');
                    const day = String(jsDate.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
                
                // 检查是否已经是Date对象（处理可能的情况）
                if (dateString instanceof Date) {
                    // 使用本地时间构建日期字符串
                    const year = dateString.getFullYear();
                    const month = String(dateString.getMonth() + 1).padStart(2, '0');
                    const day = String(dateString.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
                
                // 最后尝试使用Date对象解析
                try {
                    const date = new Date(dateString);
                    // 使用本地时间构建日期字符串，避免时区转换
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                } catch (error) {
                    return dateString;
                }
            };
            
            // 渲染数据行
            // 按照订单号分组，记录已经显示过的订单号
            const displayedOrderNos = {};
            
            currentPageData.forEach(record => {
                // 确保记录有id
                if (!record.id) {
                    record.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                }
                
                // 检查当前订单号是否已经显示过
                const isOrderNoDisplayed = displayedOrderNos[record.orderNo];
                
                // 标记当前订单号已显示
                displayedOrderNos[record.orderNo] = true;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="order-checkbox" data-id="${record.id}"></td>
                    <td><span class="status-badge ${record.status === '待生产' ? 'status-pending' : record.status === '生产中' ? 'status-processing' : record.status === '已出货' ? 'status-completed' : ''}" onclick="toggleOrderStatus('${record.id}')">${record.status || '待生产'}</span></td>
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${formatDate(record.orderDate)}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${record.customer || ''}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${record.orderNo || ''}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${formatDate(record.deliveryDate)}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${record.tradeTerms || ''}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${record.paymentMethod || ''}</td>`}
                    ${isOrderNoDisplayed ? '<td></td>' : `<td>${record.transportMethod || ''}</td>`}
                    <td>${record.productName || ''}</td>
                    <td>${record.spec || ''}</td>
                    <td>${record.drawingNo || ''}</td>
                    <td><span class="inline-block px-2 py-1 rounded ${record.plating === '否' ? 'bg-green-600 text-white' : record.plating === '是' ? 'bg-red-600 text-white' : ''}">${record.plating || ''}</span></td>
                    <td>${record.logo || ''}</td>
                    <td>${record.unit || ''}</td>
                    <td>${record.unitPrice ? parseFloat(record.unitPrice).toFixed(2) : '0.00'}</td>
                    <td>${record.quantity || ''}</td>
                    <td>${record.amount ? parseFloat(record.amount).toFixed(2) : '0.00'}</td>
                    <td>${record.currency || ''}</td>
                    <td>${record.packing || ''}</td>
                    <td>${record.remark || ''}</td>
                    <td>
                        <button class="btn btn-primary btn-sm table-action-btn" onclick="editOrder('${record.id}')" title="编辑">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-sm table-action-btn" onclick="deleteOrder('${record.id}')" title="删除">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="orderPageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="orderPageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                                <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                                <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                                <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                                <option value="200" ${info.pageSize === 200 ? 'selected' : ''}>200条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="orderFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="orderPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="orderPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="orderNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="orderLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="orderGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        // 重新绑定事件
        this.initTablePaginationEvents('order');
        // 重新初始化全选功能，确保在表格重新渲染后仍能正常工作
        // （内部会根据 selectedOrderIds 同步当前页复选框与全选框状态）
        initOrderTableSelectAll();
    }
    
    // 渲染客户信息卡片网格
    renderCustomerTable(records = null) {
        // 如果传入了记录，更新分页数据
        if (records) {
            paginations.customer.setFilteredData(records);
        } else {
            // 没有传入记录时
            // 如果当前过滤数据为空，从storage获取最新数据并初始化
            if (paginations.customer.filteredData.length === 0) {
                const latestRecords = storage.getCustomerRecords();
                paginations.customer.setData(latestRecords);
            }
            // 否则保持当前的过滤状态，这样分页时会继续使用之前筛选的数据
        }
        
        const pagination = paginations.customer;
        const currentPageData = pagination.getCurrentPageData();
        const customersGrid = document.getElementById('customers-grid');
        const paginationContainer = document.getElementById('customerPagination');
        
        if (!customersGrid) return;
        
        customersGrid.innerHTML = '';
        
        // 更新统计数据
        const customerCount = document.getElementById('tag-all-count');
        const allRecords = storage.getCustomerRecords();
        if (customerCount) customerCount.textContent = pagination.totalItems;
        
        // 统计所有记录中的客户数量
        const totalCustomers = allRecords.filter(record => record.customerType === '客户').length;
        const customerTypeCount = document.getElementById('tag-customer-count');
        if (customerTypeCount) customerTypeCount.textContent = totalCustomers;
        
        // 统计所有记录中的供应商数量
        const totalSuppliers = allRecords.filter(record => record.customerType === '供应商').length;
        const supplierCount = document.getElementById('tag-supplier-count');
        if (supplierCount) supplierCount.textContent = totalSuppliers;
        
        if (currentPageData.length === 0) {
            customersGrid.innerHTML = '<div class="col-span-full text-center text-gray-500 py-8">暂无客户数据</div>';
        } else {
            // 渲染客户卡片
            currentPageData.forEach(record => {
                const card = document.createElement('div');
                card.className = 'bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow p-5 mb-6';
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <div class="flex items-center">
                                <h3 class="text-xl font-semibold text-gray-800 mb-1">${record.customerName || ''}</h3>
                                <button class="ml-2 text-gray-500 hover:text-blue-600" title="复制公司名称" onclick="copyToClipboard('${record.customerName || ''}', '公司名称已复制！')">
                                    <i class="fa fa-copy"></i>
                                </button>
                            </div>
                            <div class="text-sm text-gray-500">
                                ${record.customerType || ''} | ${record.region || ''}
                            </div>
                        </div>
                        <div class="flex space-x-2">
                            <button class="text-gray-500 hover:text-blue-600 view-customer-detail text-2xl" title="查看" data-id="${record.id}">
                                <i class="fa fa-eye"></i>
                            </button>
                            <button class="text-gray-500 hover:text-red-500 priority-star text-2xl" title="优先级" data-id="${record.id}" ${record.priority ? 'style="color: #dc2626;"' : ''}>
                                <i class="fa ${record.priority ? 'fa-star' : 'fa-star-o'}"></i>
                            </button>
                            <button class="text-gray-500 hover:text-green-600 edit-customer text-2xl" title="编辑" data-id="${record.id}">
                                <i class="fa fa-edit"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="space-y-3 text-gray-600">
                        ${record.contactName ? `<div class="flex items-center space-x-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg><span>${record.contactName}</span></div>` : ''}
                        ${record.phone ? `<div class="flex items-center space-x-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg><span>${record.phone}</span></div>` : ''}
                        ${record.email ? `<div class="flex items-center space-x-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg><a href="mailto:${record.email}" class="text-blue-600 hover:underline">${record.email}</a><button class="ml-1 text-gray-400 hover:text-blue-600" title="复制邮箱地址" onclick="copyToClipboard('${record.email}', '邮箱地址已复制！')"><i class="fa fa-copy"></i></button></div>` : ''}
                        ${record.address ? `<div class="flex items-center space-x-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg><span>${record.address}</span></div>` : ''}
                    </div>
                    
                    <div class="mt-4 flex flex-wrap gap-2">
                        ${record.tags ? record.tags.split(',').map(tag => `<span class="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">${tag.trim()}</span>`).join('') : ''}
                    </div>
                    
                    <div class="mt-5 pt-4 border-t border-gray-200">
                        <div class="flex justify-between items-center">
                            <div class="text-sm text-gray-500">创建日期: ${record.createdAt || '未知'}</div>
                            <div class="flex space-x-3">
                                <button class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors flex items-center space-x-1 contact-customer" data-id="${record.id}">
                                    <i class="fa fa-comment-o mr-1"></i>
                                    <span>联系</span>
                                </button>
                                <button class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-1 create-quote" data-id="${record.id}">
                                    <i class="fa fa-file-text-o mr-1"></i>
                                    <span>新建报价单</span>
                                </button>
                                <button class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors flex items-center space-x-1 delete-customer" data-id="${record.id}">
                                    <i class="fa fa-trash-o mr-1"></i>
                                    <span>删除</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                customersGrid.appendChild(card);
            });
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t mt-6">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="customerPageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="customerPageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="9" ${info.pageSize === 9 ? 'selected' : ''}>9条</option>
                                <option value="18" ${info.pageSize === 18 ? 'selected' : ''}>18条</option>
                                <option value="27" ${info.pageSize === 27 ? 'selected' : ''}>27条</option>
                                <option value="36" ${info.pageSize === 36 ? 'selected' : ''}>36条</option>
                                <option value="45" ${info.pageSize === 45 ? 'selected' : ''}>45条</option>
                                <option value="54" ${info.pageSize === 54 ? 'selected' : ''}>54条</option>
                                <option value="63" ${info.pageSize === 63 ? 'selected' : ''}>63条</option>
                                <option value="72" ${info.pageSize === 72 ? 'selected' : ''}>72条</option>
                                <option value="81" ${info.pageSize === 81 ? 'selected' : ''}>81条</option>
                                <option value="90" ${info.pageSize === 90 ? 'selected' : ''}>90条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="customerFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="customerPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="customerPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="customerNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="customerLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="customerGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 重新绑定事件
        this.initTablePaginationEvents('customer');
        
        // 绑定客户卡片事件
        document.querySelectorAll('.view-customer-detail').forEach(button => {
            button.addEventListener('click', function() {
                const customerId = this.getAttribute('data-id');
                viewCustomerDetail(customerId);
            });
        });
        
        document.querySelectorAll('.edit-customer').forEach(button => {
            button.addEventListener('click', function() {
                const customerId = this.getAttribute('data-id');
                editCustomer(customerId);
            });
        });
        
        document.querySelectorAll('.contact-customer').forEach(button => {
            button.addEventListener('click', function() {
                const customerId = this.getAttribute('data-id');
                contactCustomer(customerId);
            });
        });
        
        document.querySelectorAll('.delete-customer').forEach(button => {
            button.addEventListener('click', function() {
                const customerId = this.getAttribute('data-id');
                deleteCustomer(customerId);
            });
        });
        
        // 添加新建报价单按钮的事件监听器
        document.querySelectorAll('.create-quote').forEach(button => {
            button.addEventListener('click', function() {
                const customerId = this.getAttribute('data-id');
                // 获取客户信息
                const allCustomers = storage.getCustomerRecords();
                const customer = allCustomers.find(c => c.id === customerId);
                
                if (customer) {
                    // 构建查询字符串
                    const queryString = new URLSearchParams({
                        customerName: customer.customerName || '',
                        contactPerson: customer.contactName || '',
                        phone: customer.phone || '',
                        address: customer.address || '',
                        email: customer.email || ''
                    }).toString();
                    
                    // 在新窗口打开报价系统.html并传递客户信息
                    window.open(`报价系统.html?${queryString}`, '_blank');
                }
            });
        });
        
        // 绑定优先级五角星点击事件
        bindPriorityStarEvents();
    }
    
    // 渲染出口记录表格
    renderExportTable(filteredData = null) {
        let dataToUse;
        let shouldResetPage = false;
        
        // 检查是否处于过滤状态
        const isFiltered = JSON.stringify(paginations.export.filteredData) !== JSON.stringify(paginations.export.data);
        
        // 如果传入了过滤后的数据，使用它并重置页码
        if (filteredData) {
            dataToUse = filteredData;
            shouldResetPage = true;
        } else {
            // 没有传入过滤数据时
            if (isFiltered) {
                // 如果处于过滤状态，继续使用过滤后的数据
                dataToUse = paginations.export.filteredData;
            } else {
                // 否则，使用原始数据
                // 如果当前数据为空，从storage获取最新数据并初始化
                if (paginations.export.data.length === 0) {
                    const latestRecords = storage.getExportRecords();
                    paginations.export.setData(latestRecords);
                    dataToUse = latestRecords;
                    shouldResetPage = true;
                } else {
                    // 否则使用当前的数据
                    dataToUse = paginations.export.data;
                }
            }
        }
        
        // 应用排序
        const sortedData = this.applySort(dataToUse, this.sortState.export);
        
        // 根据情况选择是否重置页码
        if (shouldResetPage) {
            paginations.export.setFilteredDataWithReset(sortedData);
        } else {
            paginations.export.setFilteredData(sortedData);
        }
        
        const pagination = paginations.export;
        const currentPageData = pagination.getCurrentPageData();
        const tableBody = document.getElementById('exportTableBody');
        const paginationContainer = document.getElementById('exportPagination');
        
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        // 计算统计数据
        const totalRecords = pagination.totalItems;
        
        // 计算出口集装箱总数
        let totalContainers = 0;
        // 计算数量合计
        let totalQuantity = 0;
        const allExportRecords = pagination.filteredData;
        allExportRecords.forEach(record => {
            const containerNo = record.containerNo || '';
            if (containerNo) {
                // 分割集装箱号，统计数量
                const containers = containerNo.split(',').filter(c => c.trim() !== '');
                totalContainers += containers.length;
            } else {
                // 如果没有集装箱号，不算
                totalContainers += 0;
            }
            
            // 累加数量
            const quantity = parseFloat(record.quantity || '0');
            if (!isNaN(quantity)) {
                totalQuantity += quantity;
            }
        });
        
        // 更新统计信息
        const exportCount = document.getElementById('exportCount');
        const exportTotalContainers = document.getElementById('exportTotalContainers');
        const exportTotalQuantity = document.getElementById('exportTotalQuantity');
        
        if (exportCount) {
            exportCount.innerHTML = `${totalRecords}`;
        }
        
        if (exportTotalContainers) {
            exportTotalContainers.innerHTML = `${totalContainers}`;
        }
        
        if (exportTotalQuantity) {
            exportTotalQuantity.innerHTML = `${totalQuantity.toFixed(2)}`;
        }
        
        if (currentPageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
        } else {
            // 渲染数据行
            // 获取所有发票记录，用于检查订单是否已开票
            const allInvoiceRecords = storage.getInvoiceRecords();
            // 提取所有发票记录中的订单号，处理多个订单号情况
            const invoiceOrderNos = new Set();
            allInvoiceRecords.forEach(invoice => {
                if (invoice.orderNo) {
                    // 将发票记录中的订单号拆分为单个订单号
                    const invoiceOrders = invoice.orderNo.split(',').map(no => no.trim()).filter(Boolean);
                    // 将每个单个订单号添加到Set中
                    invoiceOrders.forEach(orderNo => invoiceOrderNos.add(orderNo));
                }
            });
            
            currentPageData.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="export-checkbox" data-id="${record.id}"></td>
                    <td><span class="status-badge ${(() => {
                        // 处理多个订单号情况，按逗号分隔
                        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                        // 检查是否有任何一个订单号在发票记录中
                        const isInvoiced = orderNos.some(orderNo => invoiceOrderNos.has(orderNo));
                        return isInvoiced ? 'bg-green-800 text-white' : 'bg-red-600 text-white';
                    })()}">${(() => {
                        // 处理多个订单号情况，按逗号分隔
                        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                        // 检查是否有任何一个订单号在发票记录中
                        const isInvoiced = orderNos.some(orderNo => invoiceOrderNos.has(orderNo));
                        return isInvoiced ? '已开票' : '未开票';
                    })()}</span></td>
                    <td>${record.exportDate || ''}</td>
                    <td>${record.arrivalDate || ''}</td>
                    <td>${record.customer || ''}</td>
                    <td>${record.quantity ? parseFloat(record.quantity).toFixed(2) : ''}</td>
                    <td>${record.orderNo || ''}</td>
                    <td>${record.shippingNo || ''}</td>
                    <td>${record.shipName || ''}</td>
                    <td>${record.containerNo || ''}</td>
                    <td>${record.billNo || ''}</td>
                    <td>${record.currency ? record.currency + ' ' : ''}${record.declarationAmount ? parseFloat(record.declarationAmount).toFixed(2) : ''}</td>
                    <td>${record.remark || ''}</td>
                    <td>
                        <button class="btn btn-primary btn-sm table-action-btn" onclick="editExport('${record.id}')" title="编辑">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-sm table-action-btn" onclick="deleteExport('${record.id}')" title="删除">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="exportPageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="exportPageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                                <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                                <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                                <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="exportFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="exportPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="exportPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="exportNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="exportLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="exportGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 重新绑定事件
        this.initTablePaginationEvents('export');
        // 重新初始化出口管理表格全选功能，确保在表格重新渲染后仍能正常工作
        initExportTableSelectAll();
    }
    
    // 渲染收汇记录表格
    renderReceiptTable(filteredData = null) {
        let dataToUse;
        let shouldResetPage = false;
        
        // 检查是否处于过滤状态
        const isFiltered = JSON.stringify(paginations.receipt.filteredData) !== JSON.stringify(paginations.receipt.data);
        
        // 如果传入了过滤后的数据，使用它并重置页码
        if (filteredData) {
            dataToUse = filteredData;
            shouldResetPage = true;
        } else {
            // 没有传入过滤数据时
            if (isFiltered) {
                // 如果处于过滤状态，继续使用过滤后的数据
                dataToUse = paginations.receipt.filteredData;
            } else {
                // 否则，使用原始数据
                // 如果当前数据为空，从storage获取最新数据并初始化
                if (paginations.receipt.data.length === 0) {
                    const latestRecords = storage.getReceiptRecords();
                    paginations.receipt.setData(latestRecords);
                    dataToUse = latestRecords;
                    shouldResetPage = true;
                } else {
                    // 否则使用当前的数据
                    dataToUse = paginations.receipt.data;
                }
            }
        }
        
        // 应用排序
        const sortedData = this.applySort(dataToUse, this.sortState.receipt);
        
        // 根据情况选择是否重置页码
        if (shouldResetPage) {
            paginations.receipt.setFilteredDataWithReset(sortedData);
        } else {
            paginations.receipt.setFilteredData(sortedData);
        }
        
        const pagination = paginations.receipt;
        const currentPageData = pagination.getCurrentPageData();
        const tableBody = document.getElementById('receiptTableBody');
        const paginationContainer = document.getElementById('receiptPagination');
        
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        // 计算统计数据
        const totalRecords = sortedData.length;
        const totalAmountReceived = sortedData.reduce((sum, record) => {
            const amount = parseFloat(record.amountReceived || 0);
            const exchangeRate = parseFloat(record.exchangeRate || 1);
            return sum + (amount * exchangeRate);
        }, 0);
        const totalFee = sortedData.reduce((sum, record) => sum + parseFloat(record.fee || 0), 0);
        
        // 更新统计信息
        const receiptCount = document.getElementById('receiptCount');
        const receiptTotalAmount = document.getElementById('receiptTotalAmount');
        const receiptTotalFee = document.getElementById('receiptTotalFee');
        
        if (receiptCount) {
            receiptCount.innerHTML = `${totalRecords}`;
        }
        
        if (receiptTotalAmount) {
            receiptTotalAmount.innerHTML = `¥${totalAmountReceived.toFixed(2)}`;
        }
        
        if (receiptTotalFee) {
            receiptTotalFee.innerHTML = `¥${totalFee.toFixed(2)}`;
        }
        
        if (currentPageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="12" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
        } else {
            // 计算每个订单号的收汇合计比例
            const orderTotalRates = {};
            const allReceiptRecords = storage.receiptRecords;
            
            // 按订单号分组收汇记录
            const receiptByOrderNo = {};
            allReceiptRecords.forEach(record => {
                const orderNo = record.orderNo;
                if (!receiptByOrderNo[orderNo]) {
                    receiptByOrderNo[orderNo] = [];
                }
                receiptByOrderNo[orderNo].push(record);
            });
            
            // 计算每个订单号的合计收汇比例
            Object.keys(receiptByOrderNo).forEach(orderNo => {
                const receipts = receiptByOrderNo[orderNo];
                const totalRate = receipts.reduce((sum, receipt) => {
                    const rate = parseFloat(receipt.rate) || 0;
                    return sum + rate;
                }, 0);
                orderTotalRates[orderNo] = totalRate;
            });
            
            // 获取账务管理中的所有订单号，用于对比
            const paymentRecords = storage.getPaymentRecords();
            const paymentOrderNos = new Set();
            paymentRecords.forEach(record => {
                if (record.orderNo) {
                    const orderNos = record.orderNo.split(',').map(no => no.trim()).filter(Boolean);
                    orderNos.forEach(no => paymentOrderNos.add(no));
                }
            });
            
            // 渲染数据行
            currentPageData.forEach(record => {
                // 确保记录有id
                if (!record.id) {
                    record.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                }
                
                // 格式化数值，保留2位小数
                const formattedAmountReceived = parseFloat(record.amountReceived || 0).toFixed(2);
                const formattedFee = parseFloat(record.fee || 0).toFixed(2);
                const formattedExchangeRate = parseFloat(record.exchangeRate || 0).toFixed(2);
                
                // 根据订单号的合计比例确定状态显示和样式
                let chineseStatus;
                let statusClass = '';
                const orderNo = record.orderNo;
                const totalRate = orderTotalRates[orderNo] || 0;
                
                if (totalRate > 0 && totalRate < 100) {
                    chineseStatus = '部分收汇';
                    statusClass = 'status-partial';
                } else if (totalRate >= 100) {
                    chineseStatus = '收汇完毕';
                    statusClass = 'status-completed';
                } else {
                    // 默认状态映射
                    const statusMap = {
                        'pending': '待处理',
                        'completed': '已完成',
                        'failed': '失败',
                        '': '未知'
                    };
                    chineseStatus = statusMap[record.status] || statusMap[''];
                    // 为默认状态添加对应的样式类
                    const defaultStatusClassMap = {
                        '待处理': 'status-pending',
                        '已完成': 'status-completed',
                        '失败': 'status-failed',
                        '未知': 'status-unknown'
                    };
                    statusClass = defaultStatusClassMap[chineseStatus] || '';
                }
                
                // 检查订单号是否在账务管理中存在
                const orderNos = (orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                const hasUnpaidOrder = orderNos.some(no => !paymentOrderNos.has(no));
                
                // 渲染订单号单元格
                let orderNoCell = '';
                if (hasUnpaidOrder) {
                    // 如果有未付款的订单号，添加红色背景和说明
                    orderNoCell = `
                        <div style="background-color: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; display: inline-block;">
                            ${record.orderNo || ''}
                        </div>
                        <span style="color: #dc2626; font-size: 11px; display: block; margin-top: 2px;">⚠️ 人民币未支付</span>
                    `;
                } else {
                    orderNoCell = record.orderNo || '';
                }
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="receipt-checkbox" data-id="${record.id}"></td>
                    <td><span class="status-badge ${statusClass}">${chineseStatus}</span></td>
                    <td>${record.customer || ''}</td>
                    <td>${orderNoCell}</td>
                    <td>${record.receiptDate || ''}</td>
                    <td>${formattedAmountReceived}</td>
                    <td>${formattedFee}</td>
                    <td>${record.currency || ''}</td>
                    <td>${formattedExchangeRate}</td>
                    <td>${record.rate || ''}</td>
                    <td>${record.remark || ''}</td>
                    <td>
                        <button class="btn btn-primary btn-sm table-action-btn" onclick="editReceipt('${record.id}')" title="编辑">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-sm table-action-btn" onclick="deleteReceipt('${record.id}')" title="删除">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
            
            // 添加复选框点击事件监听
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) {
                tableContainer.addEventListener('change', handleReceiptCheckboxClick);
            }
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="receiptPageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="receiptPageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                                <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                                <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                                <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="receiptFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="receiptPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="receiptPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="receiptNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="receiptLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="receiptGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 重新绑定事件
        this.initTablePaginationEvents('receipt');
    }
    
    // 渲染开票记录表格
    renderInvoiceTable(filteredData = null) {
        // 从storage获取最新开票记录
        let latestRecords = storage.getInvoiceRecords();
        
        // 为没有ID的记录添加唯一ID
        let hasMissingId = false;
        latestRecords = latestRecords.map(record => {
            if (!record.id) {
                hasMissingId = true;
                return {
                    ...record,
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
                };
            }
            return record;
        });
        
        // 如果有记录添加了ID，更新storage
        if (hasMissingId) {
            storage.invoiceRecords = latestRecords;
        }
        
        let dataToUse;
        let shouldResetPage = false;
        let isFiltered = false;
        
        // 如果传入了过滤后的数据，标记筛选状态
        if (filteredData) {
            isFiltered = true;
            dataToUse = filteredData;
            shouldResetPage = true;
        } else {
            // 检查是否处于过滤状态（当filteredData和data长度不同时，说明经过了筛选）
            isFiltered = paginations.invoice.filteredData.length !== paginations.invoice.data.length;
            // 没有传入过滤数据时
            if (isFiltered) {
                // 如果处于过滤状态，继续使用过滤后的数据
                dataToUse = paginations.invoice.filteredData;
            } else {
                // 否则，使用原始数据
                // 如果当前过滤数据为空，从storage获取最新数据并初始化
                if (paginations.invoice.filteredData.length === 0) {
                    // 分别设置data和filteredData
                    paginations.invoice.data = latestRecords;
                    paginations.invoice.filteredData = latestRecords;
                    paginations.invoice.totalItems = latestRecords.length;
                    paginations.invoice.totalPages = Math.max(1, Math.ceil(latestRecords.length / paginations.invoice.pageSize));
                    paginations.invoice.currentPage = 1;
                    dataToUse = latestRecords;
                    shouldResetPage = true;
                } else {
                    // 否则使用当前的数据
                    dataToUse = paginations.invoice.data;
                }
            }
        }
        
        // 应用排序
        const sortedData = this.applySort(dataToUse, this.sortState.invoice);
        
        // 根据情况选择是否重置页码
        if (shouldResetPage) {
            paginations.invoice.setFilteredDataWithReset(sortedData);
        } else {
            paginations.invoice.setFilteredData(sortedData);
        }
        
        const pagination = paginations.invoice;
        const currentPageData = pagination.getCurrentPageData();
        const tableBody = document.getElementById('invoiceTableBody');
        const paginationContainer = document.getElementById('invoicePagination');
        
        if (!tableBody) return;
        
        // 计算统计数据
        const totalRecords = sortedData.length;

        const totalAmount = sortedData.reduce((sum, record) => sum + parseFloat(record.amount || 0), 0);
        const totalAgentFee = sortedData.reduce((sum, record) => sum + parseFloat(record.agentFee || 0), 0);
        
        // 更新统计信息
        const invoiceCount = document.getElementById('invoiceCount');
        const invoiceTotalAmount = document.getElementById('invoiceTotalAmount');
        const invoiceTotalAgentFee = document.getElementById('invoiceTotalAgentFee');
        
        if (invoiceCount) {
            invoiceCount.innerHTML = `${totalRecords}`;
        }
        
        if (invoiceTotalAmount) {
            invoiceTotalAmount.innerHTML = `¥${totalAmount.toFixed(2)}`;
        }
        
        if (invoiceTotalAgentFee) {
            invoiceTotalAgentFee.innerHTML = `¥${totalAgentFee.toFixed(2)}`;
        }
        
        tableBody.innerHTML = '';
        
        if (currentPageData.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="18" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
            } else {
            // 获取所有付款记录，用于检查订单付款情况
            const allPaymentRecords = storage.getPaymentRecords();
            
            // 按订单号汇总付款金额
            const paymentByOrderNo = {};
            allPaymentRecords.forEach(payment => {
                if (payment.orderNo) {
                    // 处理付款记录中的多个订单号情况，按逗号分隔
                    const paymentOrderNos = payment.orderNo.split(',').map(no => no.trim()).filter(Boolean);
                    // 将付款金额分配给每个订单号
                    paymentOrderNos.forEach(orderNo => {
                        if (!paymentByOrderNo[orderNo]) {
                            paymentByOrderNo[orderNo] = 0;
                        }
                        paymentByOrderNo[orderNo] += parseFloat(payment.amount || 0);
                    });
                }
            });
            
            // 渲染数据行
            currentPageData.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="invoice-checkbox" data-id="${record.id}"></td>
                    <td><span class="status-badge ${(() => {
                        const invoiceAmount = parseFloat(record.amount || 0);
                        // 处理多个订单号情况，按逗号分隔
                        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                        // 计算所有相关订单的总付款金额
                        const totalPaymentAmount = orderNos.reduce((total, orderNo) => {
                            return total + (paymentByOrderNo[orderNo] || 0);
                        }, 0);
                        
                        if (totalPaymentAmount === 0) {
                            return 'bg-red-600 text-white';
                        } else if (totalPaymentAmount < invoiceAmount) {
                            return 'bg-yellow-500 text-white';
                        } else {
                            return 'bg-green-800 text-white';
                        }
                    })()}">${(() => {
                        const invoiceAmount = parseFloat(record.amount || 0);
                        // 处理多个订单号情况，按逗号分隔
                        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                        // 计算所有相关订单的总付款金额
                        const totalPaymentAmount = orderNos.reduce((total, orderNo) => {
                            return total + (paymentByOrderNo[orderNo] || 0);
                        }, 0);
                        
                        if (totalPaymentAmount === 0) {
                            return '未付款';
                        } else if (totalPaymentAmount < invoiceAmount) {
                            return '部分付款';
                        } else {
                            return '已付清';
                        }
                    })()}</span></td>
                    <td>${record.customer || ''}</td>
                    <td>${record.orderNo || ''}</td>
                    <td>${record.itemName || ''}</td>
                    <td>${record.shipmentNo || ''}</td>
                    <td>${record.payer || ''}</td>
                    <td>${record.payee || ''}</td>
                    <td>${record.receiptTotal ? parseFloat(record.receiptTotal).toFixed(2) : ''}</td>
                    <td>${record.invoiceDate || ''}</td>
                    <td>${record.quantity ? parseFloat(record.quantity).toFixed(2) : ''}</td>
                    <td>${record.unitPrice ? parseFloat(record.unitPrice).toFixed(2) : ''}</td>
                    <td>${record.amount ? parseFloat(record.amount).toFixed(2) : ''}</td>
                    <td>${record.agentFee ? parseFloat(record.agentFee).toFixed(2) : ''}</td>
                    <td>${record.domesticFreight ? parseFloat(record.domesticFreight).toFixed(2) : ''}</td>
                    <td>${record.overseasFreight ? parseFloat(record.overseasFreight).toFixed(2) : ''}</td>
                    <td>${record.remark || ''}</td>
                    <td>
                        <button class="btn btn-sm btn-primary table-action-btn" onclick="editInvoiceRecord('${record.id}')" title="编辑">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-danger table-action-btn" onclick="deleteInvoiceRecord('${record.id}')" title="删除">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="invoicePageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="invoicePageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                                <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                                <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                                <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="invoiceFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="invoicePrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="invoicePageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="invoiceNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="invoiceLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="invoiceGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 重新绑定事件
        this.initTablePaginationEvents('invoice');
        
        // 更新查询条件中的客户和收款单位选项
        this.updateInvoiceFilterOptions();
        
        // 初始化搜索功能
        this.initInvoiceSearch();
        // 初始化发票管理表格全选功能
        initInvoiceTableSelectAll();
    }
    
    // 更新发票管理查询条件中的客户和收款单位选项
    updateInvoiceFilterOptions() {
        // 获取所有发票记录
        const invoiceRecords = storage.getInvoiceRecords();
        
        // 提取唯一的客户名称
        const uniqueCustomers = [...new Set(invoiceRecords.map(record => record.customer || '').filter(Boolean))];
        
        // 提取唯一的收款单位名称
        const uniquePayees = [...new Set(invoiceRecords.map(record => record.payee || '').filter(Boolean))];
        
        // 更新客户下拉框
        const customerSelect = document.getElementById('invoiceCustomerSearch');
        if (customerSelect) {
            // 保存当前选中的值
            const currentValue = customerSelect.value;
            
            // 清空现有选项，保留第一个"所有客户"选项
            customerSelect.innerHTML = '<option value="">所有客户</option>';
            
            // 添加新的客户选项
            uniqueCustomers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer;
                option.textContent = customer;
                customerSelect.appendChild(option);
            });
            
            // 恢复当前选中的值
            if (currentValue) {
                customerSelect.value = currentValue;
            }
        }
        
        // 更新收款单位下拉框
        const payeeSelect = document.getElementById('invoicePayeeSearch');
        if (payeeSelect) {
            // 保存当前选中的值
            const currentValue = payeeSelect.value;
            
            // 清空现有选项，保留第一个"所有单位"选项
            payeeSelect.innerHTML = '<option value="">所有单位</option>';
            
            // 添加新的收款单位选项
            uniquePayees.forEach(payee => {
                const option = document.createElement('option');
                option.value = payee;
                option.textContent = payee;
                payeeSelect.appendChild(option);
            });
            
            // 恢复当前选中的值
            if (currentValue) {
                payeeSelect.value = currentValue;
            }
        }
    }
    
    // 初始化发票搜索功能
    initInvoiceSearch() {
        const searchInput = document.getElementById('invoiceSearch');
        if (searchInput) {
            // 移除可能存在的旧事件监听器
            searchInput.removeEventListener('input', this.handleInvoiceSearch.bind(this));
            // 添加新的事件监听器
            searchInput.addEventListener('input', this.handleInvoiceSearch.bind(this));
        }
    }
    
    // 处理发票搜索
    handleInvoiceSearch() {
        const searchInput = document.getElementById('invoiceSearch');
        if (!searchInput) return;
        
        const searchInputValue = searchInput.value;
        
        // 支持多词搜索，词与词之间用英文逗号分隔
        const searchTerms = searchInputValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
        
        // 获取所有发票记录和付款记录
        let allInvoiceRecords = storage.getInvoiceRecords();
        const allPaymentRecords = storage.getPaymentRecords();
        
        // 按订单号汇总付款金额
        const paymentByOrderNo = {};
        allPaymentRecords.forEach(payment => {
            if (payment.orderNo) {
                const paymentOrderNos = payment.orderNo.split(',').map(no => no.trim()).filter(Boolean);
                paymentOrderNos.forEach(orderNo => {
                    if (!paymentByOrderNo[orderNo]) {
                        paymentByOrderNo[orderNo] = 0;
                    }
                    paymentByOrderNo[orderNo] += parseFloat(payment.amount) || 0;
                });
            }
        });
        
        // 获取发票状态的辅助函数
        const getInvoiceStatus = (record) => {
            const invoiceAmount = parseFloat(record.amount || 0);
            const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
            const totalPaymentAmount = orderNos.reduce((total, orderNo) => {
                return total + (paymentByOrderNo[orderNo] || 0);
            }, 0);
            
            if (totalPaymentAmount === 0) {
                return '未付款';
            } else if (invoiceAmount > 0 && totalPaymentAmount < invoiceAmount) {
                return '部分付款';
            } else if (invoiceAmount > 0 && totalPaymentAmount >= invoiceAmount) {
                return '已付清';
            } else {
                // 发票金额为0或NaN时，有付款但无法判断是否付清，视为部分付款
                return totalPaymentAmount > 0 ? '部分付款' : '未付款';
            }
        };
        
        // 应用搜索过滤
        let filteredRecords = allInvoiceRecords;
        
        if (searchTerms.length > 0) {
            filteredRecords = allInvoiceRecords.filter(record => {
                // 检查记录是否包含任意一个搜索词
                return searchTerms.some(term => {
                    return Object.values(record).some(value => {
                        if (value === null || value === undefined) return false;
                        return String(value).toLowerCase().includes(term);
                    });
                });
            });
        }
        
        // 应用其他筛选条件
        const customer = document.getElementById('invoiceCustomerSearch').value;
        const payee = document.getElementById('invoicePayeeSearch').value;
        const statusFilter = document.getElementById('invoiceStatusFilter').value;
        const dateFrom = document.getElementById('invoiceDateFrom').value;
        const dateTo = document.getElementById('invoiceDateTo').value;
        
        filteredRecords = filteredRecords.filter(record => {
            // 客户筛选
            if (customer && record.customer !== customer) {
                return false;
            }
            
            // 收款单位筛选
            if (payee && record.payee !== payee) {
                return false;
            }
            
            // 状态筛选
            if (statusFilter) {
                const invoiceStatus = getInvoiceStatus(record);
                if (invoiceStatus !== statusFilter) {
                    return false;
                }
            }
            
            // 日期筛选
            if (dateFrom && record.invoiceDate < dateFrom) {
                return false;
            }
            
            if (dateTo && record.invoiceDate > dateTo) {
                return false;
            }
            
            return true;
        });
        
        // 重新渲染表格
        this.renderInvoiceTable(filteredRecords);
    }
    
    // 初始化付款搜索功能
    initPaymentSearch() {
        const searchInput = document.getElementById('paymentSearch');
        if (searchInput) {
            // 移除可能存在的旧事件监听器
            searchInput.removeEventListener('input', this.handlePaymentSearch.bind(this));
            // 添加新的事件监听器，使用防抖
            searchInput.addEventListener('input', this.debouncePaymentSearch.bind(this));
        }
    }
    
    // 防抖计时器
    paymentSearchTimer = null;
    
    // 防抖版本的付款搜索
    debouncePaymentSearch() {
        // 清除之前的计时器
        if (this.paymentSearchTimer) {
            clearTimeout(this.paymentSearchTimer);
        }
        
        // 设置新的计时器，延迟300毫秒后执行搜索
        this.paymentSearchTimer = setTimeout(() => {
            this.handlePaymentSearch();
        }, 300);
    }
    
    // 处理付款搜索
    handlePaymentSearch() {
        const searchInput = document.getElementById('paymentSearch');
        if (!searchInput) return;
        
        const searchInputValue = searchInput.value;
        
        // 支持多词搜索，词与词之间用英文逗号分隔
        const searchTerms = searchInputValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
        
        // 获取所有付款记录
        let allPaymentRecords = storage.getPaymentRecords();
        
        // 应用搜索过滤
        let filteredRecords = allPaymentRecords;
        
        if (searchTerms.length > 0) {
            filteredRecords = allPaymentRecords.filter(record => {
                // 检查记录是否包含任意一个搜索词
                return searchTerms.some(term => {
                    return Object.values(record).some(value => {
                        if (value === null || value === undefined) return false;
                        return String(value).toLowerCase().includes(term);
                    });
                });
            });
        }
        
        // 应用其他筛选条件
        const customer = document.getElementById('paymentCustomerSearch').value;
        const paymentType = document.getElementById('paymentTypeSearch').value;
        const recipient = document.getElementById('paymentRecipientSearch').value;
        const dateFrom = document.getElementById('paymentStartDate').value;
        const dateTo = document.getElementById('paymentEndDate').value;
        
        filteredRecords = filteredRecords.filter(record => {
            // 客户筛选
            if (customer && record.customer !== customer) {
                return false;
            }
            
            // 付款类型筛选
            if (paymentType && record.paymentMethod !== paymentType) {
                return false;
            }
            
            // 收款单位筛选
            if (recipient && record.recipient !== recipient) {
                return false;
            }
            
            // 日期筛选
            if (dateFrom && record.paymentDate < dateFrom) {
                return false;
            }
            
            if (dateTo && record.paymentDate > dateTo) {
                return false;
            }
            
            return true;
        });
        
        // 重新渲染表格
        this.renderPaymentTable(filteredRecords);
    }
    
    // 渲染付款记录表格
    renderPaymentTable(filteredData = null) {
        let dataToUse;
        let shouldResetPage = false;
        
        // 检查是否处于过滤状态
        const isFiltered = JSON.stringify(paginations.payment.filteredData) !== JSON.stringify(paginations.payment.data);
        
        // 如果传入了过滤后的数据，使用它并重置页码
        if (filteredData) {
            dataToUse = filteredData;
            shouldResetPage = true;
        } else {
            // 没有传入过滤数据时
            if (isFiltered) {
                // 如果处于过滤状态，继续使用过滤后的数据
                dataToUse = paginations.payment.filteredData;
            } else {
                // 否则，使用原始数据
                // 如果当前数据为空，从storage获取最新数据并初始化
                if (paginations.payment.data.length === 0) {
                    const latestRecords = storage.getPaymentRecords();
                    paginations.payment.setData(latestRecords);
                    dataToUse = latestRecords;
                    shouldResetPage = true;
                } else {
                    // 否则使用当前的数据
                    dataToUse = paginations.payment.data;
                }
            }
        }
        
        // 应用排序
        const sortedData = this.applySort(dataToUse, this.sortState.payment);
        
        // 根据情况选择是否重置页码
        if (shouldResetPage) {
            paginations.payment.setFilteredDataWithReset(sortedData);
        } else {
            paginations.payment.setFilteredData(sortedData);
        }
        
        const pagination = paginations.payment;
        
        const currentPageData = pagination.getCurrentPageData();
        const tableBody = document.getElementById('paymentTableBody');
        const paginationContainer = document.getElementById('paymentPagination');
        
        if (!tableBody) return;
        
        // 计算统计数据
        const totalRecords = sortedData.length;
        const totalAmount = sortedData.reduce((sum, record) => sum + parseFloat(record.amount || 0), 0);
        
        // 更新统计信息
        const paymentCount = document.getElementById('paymentCount');
        const paymentTotalAmount = document.getElementById('paymentTotalAmount');
        
        if (paymentCount) {
            paymentCount.innerHTML = `${totalRecords}`;
        }
        
        if (paymentTotalAmount) {
            paymentTotalAmount.innerHTML = `¥${totalAmount.toFixed(2)}`;
        }
        
        tableBody.innerHTML = '';
        
        if (currentPageData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
        } else {
            // 渲染数据行
            currentPageData.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><input type="checkbox" class="payment-checkbox" data-id="${record.id}"></td>
                    <td>${record.customer || ''}</td>
                    <td>${record.orderNo || ''}</td>
                    <td>${record.paymentDate || ''}</td>
                    <td>${record.amount ? parseFloat(record.amount).toFixed(2) : ''}</td>
                    <td>${record.paymentMethod || ''}</td>
                    <td>${record.payer || ''}</td>
                    <td>${record.recipient || ''}</td>
                    <td>${record.remark || ''}</td>
                    <td>
                        <button class="btn btn-primary btn-sm table-action-btn" onclick="editPayment('${record.id}')" title="编辑">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-sm table-action-btn" onclick="deletePayment('${record.id}')" title="删除">
                            <i class="fa fa-trash"></i>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
        
        // 渲染分页控件
        if (paginationContainer) {
            const info = pagination.getPaginationInfo();
            paginationContainer.innerHTML = `
                <div class="flex flex-wrap items-center justify-between p-3 border-t">
                    <!-- 记录统计 -->
                    <div class="text-sm text-gray-600 mb-3 md:mb-0">
                        显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                    </div>
                    
                    <!-- 分页控件 -->
                    <div class="flex items-center space-x-2">
                        <!-- 每页显示条数 -->
                        <div class="flex items-center space-x-1">
                            <label for="paymentPageSize" class="text-sm text-gray-600">每页显示：</label>
                            <select id="paymentPageSize" class="form-input text-sm" style="width: 80px;">
                                <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                                <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                                <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                                <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                            </select>
                        </div>
                        
                        <!-- 页码导航 -->
                        <div class="flex items-center space-x-1 pagination-buttons">
                            <button id="paymentFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                首页
                            </button>
                            <button id="paymentPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                                上一页
                            </button>
                            
                            <!-- 页码显示 -->
                            <div class="text-sm text-gray-600 page-info">
                                <input type="number" id="paymentPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                       class="form-input text-sm text-center">
                                <span>/ ${info.totalPages}</span>
                            </div>
                            
                            <button id="paymentNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                下一页
                            </button>
                            <button id="paymentLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                                末页
                            </button>
                            
                            <!-- 跳转按钮 -->
                            <button id="paymentGoPage" class="btn btn-primary btn-sm">
                                跳转
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 重新绑定事件
        this.initTablePaginationEvents('payment');
        
        // 初始化全选功能
        initPaymentTableSelectAll();
        
        // 初始化搜索功能
        this.initPaymentSearch();
    }
    
    // 初始化表格分页事件
    initTablePaginationEvents(tableType) {
        // 获取对应表格类型的分页控件
        const firstPageBtn = document.getElementById(`${tableType}FirstPage`);
        const prevPageBtn = document.getElementById(`${tableType}PrevPage`);
        const nextPageBtn = document.getElementById(`${tableType}NextPage`);
        const lastPageBtn = document.getElementById(`${tableType}LastPage`);
        const goPageBtn = document.getElementById(`${tableType}GoPage`);
        const pageInput = document.getElementById(`${tableType}PageInput`);
        const pageSizeSelect = document.getElementById(`${tableType}PageSize`);
        
        // 绑定首页按钮事件
        if (firstPageBtn) {
            firstPageBtn.onclick = () => {
                paginations[tableType].firstPage();
                if (tableType === 'order') {
                    pageController.renderOrderTable();
                } else if (tableType === 'export') {
                    pageController.renderExportTable();
                } else if (tableType === 'receipt') {
                    pageController.renderReceiptTable();
                } else if (tableType === 'invoice') {
                    pageController.renderInvoiceTable();
                } else if (tableType === 'payment') {
                    pageController.renderPaymentTable();
                } else if (tableType === 'customer') {
                    pageController.renderCustomerTable();
                }
            };
        }
        
        // 绑定上一页按钮事件
        if (prevPageBtn) {
            prevPageBtn.onclick = () => {
                paginations[tableType].prevPage();
                if (tableType === 'order') {
                    pageController.renderOrderTable();
                } else if (tableType === 'export') {
                    pageController.renderExportTable();
                } else if (tableType === 'receipt') {
                    pageController.renderReceiptTable();
                } else if (tableType === 'invoice') {
                    pageController.renderInvoiceTable();
                } else if (tableType === 'payment') {
                    pageController.renderPaymentTable();
                } else if (tableType === 'customer') {
                    pageController.renderCustomerTable();
                }
            };
        }
        
        // 绑定下一页按钮事件
        if (nextPageBtn) {
            nextPageBtn.onclick = () => {
                paginations[tableType].nextPage();
                if (tableType === 'order') {
                    pageController.renderOrderTable();
                } else if (tableType === 'export') {
                    pageController.renderExportTable();
                } else if (tableType === 'receipt') {
                    pageController.renderReceiptTable();
                } else if (tableType === 'invoice') {
                    pageController.renderInvoiceTable();
                } else if (tableType === 'payment') {
                    pageController.renderPaymentTable();
                } else if (tableType === 'customer') {
                    pageController.renderCustomerTable();
                }
            };
        }
        
        // 绑定末页按钮事件
        if (lastPageBtn) {
            lastPageBtn.onclick = () => {
                paginations[tableType].lastPage();
                if (tableType === 'order') {
                    pageController.renderOrderTable();
                } else if (tableType === 'export') {
                    pageController.renderExportTable();
                } else if (tableType === 'receipt') {
                    pageController.renderReceiptTable();
                } else if (tableType === 'invoice') {
                    pageController.renderInvoiceTable();
                } else if (tableType === 'payment') {
                    pageController.renderPaymentTable();
                } else if (tableType === 'customer') {
                    pageController.renderCustomerTable();
                }
            };
        }
        
        // 绑定跳转按钮事件
        if (goPageBtn && pageInput) {
            goPageBtn.onclick = () => {
                const page = parseInt(pageInput.value);
                if (!isNaN(page)) {
                    paginations[tableType].goToPage(page);
                    if (tableType === 'order') {
                        pageController.renderOrderTable();
                    } else if (tableType === 'export') {
                        pageController.renderExportTable();
                    } else if (tableType === 'receipt') {
                        pageController.renderReceiptTable();
                    } else if (tableType === 'invoice') {
                        pageController.renderInvoiceTable();
                    } else if (tableType === 'payment') {
                        pageController.renderPaymentTable();
                    } else if (tableType === 'customer') {
                        pageController.renderCustomerTable();
                    }
                }
            };
        }
        
        // 绑定页码输入框回车事件
        if (pageInput) {
            pageInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    const page = parseInt(pageInput.value);
                    if (!isNaN(page)) {
                        paginations[tableType].goToPage(page);
                        if (tableType === 'order') {
                            pageController.renderOrderTable();
                        } else if (tableType === 'export') {
                            pageController.renderExportTable();
                        } else if (tableType === 'receipt') {
                            pageController.renderReceiptTable();
                        } else if (tableType === 'invoice') {
                            pageController.renderInvoiceTable();
                        } else if (tableType === 'payment') {
                            pageController.renderPaymentTable();
                        } else if (tableType === 'customer') {
                            pageController.renderCustomerTable();
                        }
                    }
                }
            };
        }
        
        // 绑定每页显示条数选择事件
        if (pageSizeSelect) {
            pageSizeSelect.onchange = () => {
                const size = parseInt(pageSizeSelect.value);
                if (!isNaN(size)) {
                    paginations[tableType].setPageSize(size);
                    if (tableType === 'order') {
                        pageController.renderOrderTable();
                    } else if (tableType === 'export') {
                        pageController.renderExportTable();
                    } else if (tableType === 'receipt') {
                        pageController.renderReceiptTable();
                    } else if (tableType === 'invoice') {
                        pageController.renderInvoiceTable();
                    } else if (tableType === 'payment') {
                        pageController.renderPaymentTable();
                    } else if (tableType === 'customer') {
                        pageController.renderCustomerTable();
                    }
                }
            };
        }
    }
    
    // 显示通知
        showNotification(message, type = 'success') {
            const notification = document.getElementById('notification');
            const notificationIcon = document.getElementById('notificationIcon');
            const notificationMessage = document.getElementById('notificationMessage');
            
            if (!notification || !notificationIcon || !notificationMessage) return;
            
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                warning: 'bg-yellow-500',
                info: 'bg-blue-500'
            };
            
            notificationIcon.textContent = icons[type] || icons.info;
            notificationMessage.textContent = message;
            notification.className = `fixed top-24 right-4 z-5000 p-4 rounded-lg shadow-lg transition-all duration-300 transform ${colors[type] || colors.info} text-white`;
            
            // 移除hidden类，确保通知可见
            notification.classList.remove('hidden');
            notification.style.transform = 'translateX(0)';
            
            setTimeout(() => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    notification.classList.add('hidden');
                }, 300);
            }, 3000);
        }
    
    // 保存订单记录
    saveOrderRecord(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const basicRecord = Object.fromEntries(formData);
        
        // 获取所有产品行
        const productRows = form.querySelectorAll('.product-row');
        
        // 遍历所有产品行，为每个产品行创建一条订单记录
        productRows.forEach((row, index) => {
            // 获取当前产品行的表单数据
            const productRecord = {
                id: Date.now().toString() + index.toString(), // 生成唯一ID
                customer: basicRecord.customer,
                orderNo: basicRecord.orderNo,
                orderDate: basicRecord.orderDate,
                deliveryDate: basicRecord.deliveryDate,
                tradeTerms: basicRecord.tradeTerms,
                paymentMethod: basicRecord.paymentMethod,
                transportMethod: basicRecord.transportMethod,
                currency: basicRecord.currency,
                packing: basicRecord.packing,
                remark: basicRecord.remark,
                status: '待生产',
                
                // 产品信息
                productName: row.querySelector('[name="productName"]').value,
                spec: row.querySelector('[name="spec"]').value,
                drawingNo: row.querySelector('[name="drawingNo"]').value,
                plating: row.querySelector('[name="plating"]').value,
                logo: row.querySelector('[name="logo"]').value,
                unit: row.querySelector('[name="unit"]').value,
                quantity: row.querySelector('[name="quantity"]').value,
                unitPrice: row.querySelector('[name="unitPrice"]').value,
                amount: row.querySelector('[name="amount"]').value
            };
            
            // 检查订单号和产品名称组合是否已存在
            if (index === 0 && !this.validateOrderNo(basicRecord.orderNo)) {
                this.showNotification('订单号已存在，请使用其他订单号', 'error');
                return;
            }
            
            // 保存记录
            storage.addOrderRecord(productRecord);
        });
        
        // 更新分页数据，确保获取最新记录
        const latestRecords = storage.getOrderRecords();
        paginations.order.setData(latestRecords);
        
        // 更新表格
        this.renderOrderTable();
        
        // 显示成功提示
        this.showNotification('订单记录保存成功', 'success');
        
        // 关闭模态框
        closeModal('orderModal');
        
        // 重置表单
        form.reset();
        
        // 重置产品行，只保留第一行
        const productRowsContainer = document.getElementById('productRowsContainer');
        if (productRowsContainer) {
            const firstRow = productRowsContainer.querySelector('.product-row');
            productRowsContainer.innerHTML = '';
            productRowsContainer.appendChild(firstRow);
        }
    }
    
    // 编辑订单记录
    editOrderRecord(e) {
        e.preventDefault();
        const form = e.target;
        const id = document.getElementById('editOrderId').value;
        
        // 获取所有产品行
        const productRows = form.querySelectorAll('.product-row');
        
        // 获取原始订单记录
        const currentRecords = storage.orderRecords;
        const originalIndex = currentRecords.findIndex(r => r.id === id);
        
        if (originalIndex === -1) {
            this.showNotification('订单记录不存在', 'error');
            return;
        }
        
        // 获取基本信息
        const formData = new FormData(form);
        const basicRecord = Object.fromEntries(formData);
        
        // 遍历所有产品行，更新或创建订单记录
        productRows.forEach((row, index) => {
            // 获取当前产品行的表单数据
            const productRecord = {
                id: index === 0 ? id : Date.now().toString() + index.toString(), // 第一条使用原ID，其余生成新ID
                customer: basicRecord.customer,
                orderNo: basicRecord.orderNo,
                orderDate: basicRecord.orderDate,
                deliveryDate: basicRecord.deliveryDate,
                tradeTerms: basicRecord.tradeTerms,
                paymentMethod: basicRecord.paymentMethod,
                transportMethod: basicRecord.transportMethod,
                currency: basicRecord.currency,
                packing: basicRecord.packing,
                remark: basicRecord.remark,
                status: index === 0 ? currentRecords[originalIndex].status : '待生产', // 保留原始状态，新记录默认为待生产
                
                // 产品信息
                productName: row.querySelector('[name="productName"]').value,
                spec: row.querySelector('[name="spec"]').value,
                drawingNo: row.querySelector('[name="drawingNo"]').value,
                plating: row.querySelector('[name="plating"]').value,
                logo: row.querySelector('[name="logo"]').value,
                unit: row.querySelector('[name="unit"]').value,
                quantity: row.querySelector('[name="quantity"]').value,
                unitPrice: row.querySelector('[name="unitPrice"]').value,
                amount: row.querySelector('[name="amount"]').value
            };
            
            if (index === 0) {
                // 更新第一条记录
                currentRecords[originalIndex] = productRecord;
            } else {
                // 添加新记录
                currentRecords.push(productRecord);
            }
        });
        
        // 保存记录
        storage.orderRecords = currentRecords;
        
        // 更新分页数据，确保使用最新数据
        const latestRecords = storage.getOrderRecords();
        
        // 检查是否处于筛选状态
        const isFiltered = paginations.order.filteredData.length !== paginations.order.data.length;
        
        if (isFiltered) {
            // 如果处于筛选状态，重新应用筛选条件
            searchOrderRecords();
        } else {
            // 否则，更新分页数据并重新渲染
            paginations.order.setData(latestRecords);
            this.renderOrderTable();
        }
        
        // 重新初始化订单表格全选功能，确保事件监听器正确添加
        initOrderTableSelectAll();
        
        // 显示成功提示
        this.showNotification('订单记录更新成功', 'success');
        
        // 关闭模态框
        closeModal('editOrderModal');
    }
    
    // 保存出口记录
    saveExportRecord(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        // 处理多选的订单号
        const record = {};
        for (const [key, value] of formData.entries()) {
            if (key === 'orderNo') {
                // 检查是否已有订单号数组
                if (Array.isArray(record[key])) {
                    record[key].push(value);
                } else if (record[key]) {
                    // 如果已有单个值，转换为数组
                    record[key] = [record[key], value];
                } else {
                    record[key] = value;
                }
            } else {
                // 映射表单字段名到存储字段名
                switch(key) {
                    case 'shipmentNo':
                        record.shippingNo = value;
                        break;
                    case 'vesselVoyage':
                        record.shipName = value;
                        break;
                    case 'containerSeal':
                        record.containerNo = value;
                        break;
                    case 'declarationAmount':
                        // 报关金额保留两位小数
                        record[key] = parseFloat(value) ? parseFloat(value).toFixed(2) : '';
                        break;
                    case 'quantity':
                        // 数量保留两位小数
                        record[key] = parseFloat(value) ? parseFloat(value).toFixed(2) : '';
                        break;
                    default:
                        record[key] = value;
                }
            }
        }
        
        // 如果订单号是数组，转换为逗号分隔的字符串
        if (Array.isArray(record.orderNo)) {
            record.orderNo = record.orderNo.join(', ');
        }
        
        // 保存订单的货币符号
        const orderNo = record.orderNo;
        if (orderNo) {
            const orderNumbers = orderNo.split(', ');
            // 只取第一个订单的货币符号
            const firstOrderNo = orderNumbers[0];
            const order = storage.getOrderRecords().find(o => o.orderNo === firstOrderNo);
            if (order) {
                record.currency = order.currency || 'USD';
            }
        }
        
        // 生成唯一ID
        record.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        
        storage.addExportRecord(record);
        // 获取最新的出口记录数据并更新分页对象
        const latestRecords = storage.getExportRecords();
        paginations.export.updateData(latestRecords);
        
        // 检查并更新相关订单的状态为已出货
        this.updateOrderStatusBasedOnExport(latestRecords);
        
        this.renderExportTable(); // 保存后立即更新表格显示
        this.renderOrderTable(); // 更新订单表格以显示最新状态
        this.showNotification('出口记录保存成功', 'success');
        closeModal('exportModal');
        form.reset();
    }
    
    // 检查并更新相关订单的状态为已出货
    updateOrderStatusBasedOnExport(exportRecords = null) {
        // 如果没有传入出口记录，从storage获取
        const records = exportRecords || storage.getExportRecords();
        
        // 提取所有订单号，包括以逗号分隔的多个订单号组合
        const allExportedOrderNos = new Set();
        
        records.forEach(record => {
            if (record.orderNo) {
                // 处理以逗号分隔的多个订单号
                const orderNos = record.orderNo.split(', ');
                orderNos.forEach(orderNo => {
                    if (orderNo.trim()) {
                        allExportedOrderNos.add(orderNo.trim());
                    }
                });
            }
        });
        
        // 获取所有订单记录
        let orderRecords = storage.getOrderRecords();
        
        // 检查并更新每个订单的状态
        let updated = false;
        orderRecords = orderRecords.map(record => {
            // 如果订单号在出口记录中，且状态不是已出货，则更新状态
            if (allExportedOrderNos.has(record.orderNo) && record.status !== '已出货') {
                updated = true;
                return {
                    ...record,
                    status: '已出货'
                };
            }
            return record;
        });
        
        // 如果有订单状态被更新，保存并更新分页数据
        if (updated) {
            storage.orderRecords = orderRecords;
            // 更新分页缓存数据
            paginations.order.updateData(orderRecords);
        }
    }
    
    // 保存收汇记录
    saveReceiptRecord(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const record = Object.fromEntries(formData);
        
        // 检查是否有id字段，判断是编辑还是新增
        const id = record.id;
        if (id) {
            // 编辑模式
            const success = storage.updateReceiptRecord(id, record);
            if (success) {
                this.showNotification('收汇记录更新成功', 'success');
            } else {
                this.showNotification('收汇记录不存在', 'error');
            }
        } else {
            // 新增模式
            // 生成唯一ID
            record.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            storage.addReceiptRecord(record);
            this.showNotification('收汇记录保存成功', 'success');
        }
        
        // 获取最新的收汇记录数据并更新分页对象
        const latestRecords = storage.getReceiptRecords();
        paginations.receipt.setData(latestRecords);
        
        this.renderReceiptTable();
        this.updateReports();
        
        // 更新订单状态：如果订单号在收汇记录中出现，从"待生产"更新为"生产中"
        this.updateOrderStatusForReceipt();
        
        // 更新客户下拉框选项
        updateReceiptCustomerOptions();
        
        // 关闭所有收汇记录相关的模态框，确保在各种情况下都能正确关闭
        closeModal('receiptModal');
        closeModal('addReceiptModal');
        
        form.reset();
    }
    
    // 更新订单状态：当订单号出现在收汇记录中时，从"待生产"变为"生产中"
    updateOrderStatusForReceipt() {
        // 获取所有收汇记录中的订单号
        const receiptRecords = storage.getReceiptRecords();
        const receiptOrderNos = new Set(
            receiptRecords
                .filter(record => record.orderNo)
                .map(record => {
                    // 处理多订单号情况（逗号分隔）
                    if (record.orderNo.includes(',')) {
                        return record.orderNo.split(',').map(no => no.trim());
                    }
                    return record.orderNo;
                })
                .flat()
        );
        
        // 获取所有订单记录
        let orderRecords = storage.getOrderRecords();
        
        // 检查并更新每个订单的状态
        let updated = false;
        orderRecords = orderRecords.map(record => {
            // 如果订单号在收汇记录中，且状态是"待生产"，则更新为"生产中"
            if (receiptOrderNos.has(record.orderNo) && record.status === '待生产') {
                updated = true;
                return {
                    ...record,
                    status: '生产中'
                };
            }
            return record;
        });
        
        // 如果有订单状态被更新，保存并更新分页数据和表格
        if (updated) {
            storage.orderRecords = orderRecords;
            paginations.order.updateData(orderRecords);
            this.renderOrderTable();
            // 重新初始化订单表格全选功能
            initOrderTableSelectAll();
        }
    }
    
    // 初始化开票记录模态框
    initInvoiceModal() {
        // 初始化付款单位选择框事件
        const payerSelect = document.getElementById('invoicePayerSelect');
        const payerInput = document.getElementById('invoicePayerInput');
        const payerHidden = document.getElementById('invoicePayer');
        
        if (payerSelect && payerInput && payerHidden) {
            payerSelect.addEventListener('change', function() {
                if (this.value === 'other') {
                    payerInput.classList.remove('hidden');
                    payerHidden.value = '';
                } else {
                    payerInput.classList.add('hidden');
                    payerHidden.value = this.value;
                }
            });
            
            payerInput.addEventListener('input', function() {
                payerHidden.value = this.value;
            });
        }
        
        // 初始化收款单位选择框事件
        const payeeSelect = document.getElementById('invoicePayeeSelect');
        const payeeInput = document.getElementById('invoicePayeeInput');
        const payeeHidden = document.getElementById('invoicePayee');
        
        if (payeeSelect && payeeInput && payeeHidden) {
            payeeSelect.addEventListener('change', function() {
                if (this.value === 'other') {
                    payeeInput.classList.remove('hidden');
                    payeeHidden.value = '';
                } else {
                    payeeInput.classList.add('hidden');
                    payeeHidden.value = this.value;
                }
            });
            
            payeeInput.addEventListener('input', function() {
                payeeHidden.value = this.value;
            });
        }
        
        // 初始化订单号自动完成功能
        const orderNoInput = document.getElementById('invoiceOrderNo');
        const suggestionsDiv = document.getElementById('invoiceOrderNoSuggestions');
        
        if (orderNoInput && suggestionsDiv) {
            orderNoInput.addEventListener('input', function() {
                const inputValue = this.value.toLowerCase();
                // 实时更新相关字段
                pageController.fillInvoiceFieldsByOrderNo(this.value);
                const exportRecords = storage.getExportRecords();
                
                // 筛选匹配的订单号
                const matchedOrders = exportRecords.filter(record => 
                    record.orderNo && record.orderNo.toLowerCase().includes(inputValue)
                ).map(record => record.orderNo);
                
                // 去重
                const uniqueOrders = [...new Set(matchedOrders)];
                
                // 显示或隐藏建议列表
                if (uniqueOrders.length > 0 && inputValue) {
                    suggestionsDiv.innerHTML = '';
                    uniqueOrders.forEach(orderNo => {
                        const suggestionItem = document.createElement('div');
                        suggestionItem.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer';
                        suggestionItem.textContent = orderNo;
                        suggestionItem.addEventListener('click', function() {
                            // 直接替换掉输入框中的所有内容
                            orderNoInput.value = orderNo;
                            suggestionsDiv.classList.add('hidden');
                            // 根据订单号填充其他字段
                            pageController.fillInvoiceFieldsByOrderNo(orderNo);
                        });
                        suggestionsDiv.appendChild(suggestionItem);
                    });
                    suggestionsDiv.classList.remove('hidden');
                } else {
                    suggestionsDiv.classList.add('hidden');
                }
            });
            
            // 点击页面其他地方关闭建议列表
            document.addEventListener('click', function(e) {
                if (!orderNoInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
                    suggestionsDiv.classList.add('hidden');
                }
            });
        }
        
        // 初始化客户自动完成功能
        const customerInput = document.getElementById('invoiceCustomer');
        const customerSuggestionsDiv = document.getElementById('invoiceCustomerSuggestions');
        
        if (customerInput && customerSuggestionsDiv) {
            customerInput.addEventListener('input', function() {
                const inputValue = this.value.toLowerCase();
                const exportRecords = storage.getExportRecords();
                
                // 筛选匹配的客户
                const matchedCustomers = exportRecords.filter(record => 
                    record.customer && record.customer.toLowerCase().includes(inputValue)
                ).map(record => record.customer);
                
                // 去重
                const uniqueCustomers = [...new Set(matchedCustomers)];
                
                // 显示或隐藏建议列表
                if (uniqueCustomers.length > 0 && inputValue) {
                    customerSuggestionsDiv.innerHTML = '';
                    uniqueCustomers.forEach(customer => {
                        const suggestionItem = document.createElement('div');
                        suggestionItem.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer';
                        suggestionItem.textContent = customer;
                        suggestionItem.addEventListener('click', function() {
                            // 直接替换掉输入框中的所有内容
                            customerInput.value = customer;
                            customerSuggestionsDiv.classList.add('hidden');
                        });
                        customerSuggestionsDiv.appendChild(suggestionItem);
                    });
                    customerSuggestionsDiv.classList.remove('hidden');
                } else {
                    customerSuggestionsDiv.classList.add('hidden');
                }
            });
            
            // 点击页面其他地方关闭建议列表
            document.addEventListener('click', function(e) {
                if (!customerInput.contains(e.target) && !customerSuggestionsDiv.contains(e.target)) {
                    customerSuggestionsDiv.classList.add('hidden');
                }
            });
        }
        
        // 初始化运编号自动完成功能
        const shipmentNoInput = document.getElementById('invoiceShipmentNo');
        const shipmentSuggestionsDiv = document.getElementById('invoiceShipmentNoSuggestions');
        
        if (shipmentNoInput && shipmentSuggestionsDiv) {
            shipmentNoInput.addEventListener('input', function() {
                const inputValue = this.value.toLowerCase();
                const exportRecords = storage.getExportRecords();
                
                // 筛选匹配的运编号
                const matchedShipments = exportRecords.filter(record => 
                    record.shippingNo && record.shippingNo.toLowerCase().includes(inputValue)
                ).map(record => record.shippingNo);
                
                // 去重
                const uniqueShipments = [...new Set(matchedShipments)];
                
                // 显示或隐藏建议列表
                if (uniqueShipments.length > 0 && inputValue) {
                    shipmentSuggestionsDiv.innerHTML = '';
                    uniqueShipments.forEach(shipmentNo => {
                        const suggestionItem = document.createElement('div');
                        suggestionItem.className = 'px-4 py-2 hover:bg-gray-100 cursor-pointer';
                        suggestionItem.textContent = shipmentNo;
                        suggestionItem.addEventListener('click', function() {
                            // 直接替换掉输入框中的所有内容
                            shipmentNoInput.value = shipmentNo;
                            shipmentSuggestionsDiv.classList.add('hidden');
                        });
                        shipmentSuggestionsDiv.appendChild(suggestionItem);
                    });
                    shipmentSuggestionsDiv.classList.remove('hidden');
                } else {
                    shipmentSuggestionsDiv.classList.add('hidden');
                }
            });
            
            // 点击页面其他地方关闭建议列表
            document.addEventListener('click', function(e) {
                if (!shipmentNoInput.contains(e.target) && !shipmentSuggestionsDiv.contains(e.target)) {
                    shipmentSuggestionsDiv.classList.add('hidden');
                }
            });
        }
        
        // 初始化开票单价自动计算（由开票金额和开票数量计算）
        const unitPriceInput = document.getElementById('invoiceUnitPrice');
        const quantityInput = document.getElementById('invoiceQuantity');
        const amountInput = document.getElementById('invoiceAmount');
        
        if (unitPriceInput && quantityInput && amountInput) {
            const calculateUnitPrice = () => {
                const amount = parseFloat(amountInput.value) || 0;
                const quantity = parseFloat(quantityInput.value) || 0;
                let unitPrice = 0;
                if (quantity > 0) {
                    unitPrice = amount / quantity;
                }
                unitPriceInput.value = unitPrice.toFixed(2);
            };
            
            amountInput.addEventListener('input', calculateUnitPrice);
            quantityInput.addEventListener('input', calculateUnitPrice);
            
            // 为开票金额输入框添加悬停提示，显示该订单号在账务管理表格中所有付款金额的汇总额
            amountInput.addEventListener('mouseenter', function() {
                // 获取订单号输入框的值
                const orderNoInput = document.getElementById('invoiceOrderNo');
                const orderNos = orderNoInput.value.split(',').map(no => no.trim()).filter(no => no !== '');
                
                if (orderNos.length > 0) {
                    // 从账务管理表格中获取对应订单号的所有付款记录
                    const paymentRecords = storage.getPaymentRecords();
                    
                    // 筛选出匹配的付款记录
                    const matchedPayments = paymentRecords.filter(record => 
                        record.orderNo && orderNos.some(no => record.orderNo.includes(no))
                    );
                    
                    // 计算付款金额总和
                    const totalPaymentAmount = matchedPayments.reduce((total, record) => {
                        return total + parseFloat(record.amount || 0);
                    }, 0);
                    
                    // 设置悬停提示
                    this.title = `该订单号在账务管理表格中所有付款金额的汇总额: ¥${totalPaymentAmount.toFixed(2)}`;
                } else {
                    this.title = '';
                }
            });
        }
        
        // 为收汇总额输入框添加悬停提示，显示该订单在订单管理中的汇总金额
        const receiptTotalInput = document.getElementById('invoiceReceiptTotal');
        if (receiptTotalInput) {
            receiptTotalInput.addEventListener('mouseenter', function() {
                // 获取订单号输入框的值
                const orderNoInput = document.getElementById('invoiceOrderNo');
                const orderNos = orderNoInput.value.split(',').map(no => no.trim()).filter(no => no !== '');
                
                if (orderNos.length > 0) {
                    // 从订单管理中获取对应订单号的所有记录
                    const orderRecords = storage.getOrderRecords();
                    
                    // 筛选出匹配的订单记录
                    const matchedOrders = orderRecords.filter(record => 
                        orderNos.includes(record.orderNo)
                    );
                    
                    // 计算订单金额总和
                    const totalOrderAmount = matchedOrders.reduce((total, record) => {
                        return total + parseFloat(record.amount || 0);
                    }, 0);
                    
                    // 设置悬停提示
                    this.title = `该订单在订单管理中的汇总金额: ¥${totalOrderAmount.toFixed(2)}`;
                } else {
                    this.title = '';
                }
            });
        }
    }
    
    // 根据订单号填充开票记录字段
    fillInvoiceFieldsByOrderNo(orderNoInput) {
        // 处理输入的订单号，支持多个以逗号分隔的订单号
        const orderNos = orderNoInput.split(',').map(no => no.trim()).filter(no => no !== '');
        
        if (orderNos.length === 0) return;
        
        const exportRecords = storage.getExportRecords();
        const paymentRecords = storage.getPaymentRecords();
        const receiptRecords = storage.getReceiptRecords();
        const orderRecords = storage.getOrderRecords();
        
        // 查找订单对应的出口记录，支持多个订单号
        let customer = '';
        
        // 遍历所有订单号，查找匹配的出口记录
        for (const orderNo of orderNos) {
            const exportRecord = exportRecords.find(record => 
                record.orderNo && record.orderNo.includes(orderNo)
            );
            
            if (exportRecord && exportRecord.customer) {
                customer = exportRecord.customer;
                break; // 找到第一个客户后退出循环
            }
        }
        
        // 如果没有找到出口记录，尝试从订单记录中查找
        if (!customer) {
            for (const orderNo of orderNos) {
                const orderRecord = orderRecords.find(record => 
                    record.orderNo && record.orderNo.includes(orderNo)
                );
                
                if (orderRecord && orderRecord.customer) {
                    customer = orderRecord.customer;
                    break;
                }
            }
        }
        
        // 填充客户字段
        document.getElementById('invoiceCustomer').value = customer || '';
        
        // 查找第一个订单对应的付款记录
        const paymentRecord = paymentRecords.find(record => 
            record.orderNo && orderNos.some(no => record.orderNo.includes(no))
        );
        if (paymentRecord) {
            // 填充付款单位
            const payerSelect = document.getElementById('invoicePayerSelect');
            const payerInput = document.getElementById('invoicePayerInput');
            const payerHidden = document.getElementById('invoicePayer');
            
            if (payerSelect && payerInput && payerHidden) {
                // 检查付款单位是否在选项中
                const optionExists = Array.from(payerSelect.options).some(option => 
                    option.value === paymentRecord.payer
                );
                
                if (optionExists) {
                    payerSelect.value = paymentRecord.payer;
                    payerInput.classList.add('hidden');
                    payerHidden.value = paymentRecord.payer;
                } else {
                    payerSelect.value = 'other';
                    payerInput.classList.remove('hidden');
                    payerInput.value = paymentRecord.payer || '';
                    payerHidden.value = paymentRecord.payer || '';
                }
            }
            
            // 填充收款单位
            const payeeSelect = document.getElementById('invoicePayeeSelect');
            const payeeInput = document.getElementById('invoicePayeeInput');
            const payeeHidden = document.getElementById('invoicePayee');
            
            if (payeeSelect && payeeInput && payeeHidden) {
                // 检查收款单位是否在选项中
                const optionExists = Array.from(payeeSelect.options).some(option => 
                    option.value === paymentRecord.recipient
                );
                
                if (optionExists) {
                    payeeSelect.value = paymentRecord.recipient;
                    payeeInput.classList.add('hidden');
                    payeeHidden.value = paymentRecord.recipient;
                } else {
                    payeeSelect.value = 'other';
                    payeeInput.classList.remove('hidden');
                    payeeInput.value = paymentRecord.recipient || '';
                    payeeHidden.value = paymentRecord.recipient || '';
                }
            }
        }
        
        // 计算对应订单号的收汇总额
        const filteredReceipts = receiptRecords.filter(record => orderNos.includes(record.orderNo));
        
        // 直接汇总收汇金额，不转换为人民币
        const receiptTotal = filteredReceipts
            .reduce((total, record) => total + parseFloat(record.amountReceived || 0), 0);
        
        // 获取第一个收汇记录的货币类型
        let currency = 'USD';
        if (filteredReceipts.length > 0) {
            currency = filteredReceipts[0].currency || 'USD';
        }
        
        // 在收汇总额前面加上对应的货币符号
        const currencySymbolMap = {
            'USD': 'US$',
            'EUR': 'EU$',
            'CNY': '￥'
        };
        const currencySymbol = currencySymbolMap[currency] || currency;
        
        document.getElementById('invoiceReceiptTotal').value = `${currencySymbol}${receiptTotal.toFixed(2)}`;
        
        // 计算对应订单号的开票数量总和
        const quantityTotal = orderRecords
            .filter(record => orderNos.includes(record.orderNo))
            .reduce((total, record) => total + parseFloat(record.quantity || 0), 0);
        
        document.getElementById('invoiceQuantity').value = quantityTotal.toFixed(2);
    }
    
    // 保存开票记录
    saveInvoiceRecord(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const record = Object.fromEntries(formData);
        
        // 确保付款单位值正确
        const payerSelect = document.getElementById('invoicePayerSelect');
        const payerInput = document.getElementById('invoicePayerInput');
        if (payerSelect && payerInput) {
            if (payerSelect.value === 'other') {
                record.payer = payerInput.value;
            } else {
                record.payer = payerSelect.value;
            }
        }
        
        // 确保收款单位值正确
        const payeeSelect = document.getElementById('invoicePayeeSelect');
        const payeeInput = document.getElementById('invoicePayeeInput');
        if (payeeSelect && payeeInput) {
            if (payeeSelect.value === 'other') {
                record.payee = payeeInput.value;
            } else {
                record.payee = payeeSelect.value;
            }
        }
        
        // 处理收汇总额，移除货币符号并转换为数字
        if (record.receiptTotal) {
            // 移除货币符号和可能的空格，支持US$、EU$、￥
            record.receiptTotal = record.receiptTotal.replace(/US\$|EU\$|￥|\s/g, '');
        }
        
        storage.addInvoiceRecord(record);
        this.renderInvoiceTable();
        this.updateReports();
        this.showNotification('开票记录保存成功', 'success');
        closeModal('invoiceModal');
        form.reset();
    }
    
    // 保存模态框初始状态
    saveInvoiceModalInitialState() {
        // 保存当前所有字段的值
        const form = document.getElementById('invoiceForm');
        const initialState = {};
        
        // 保存输入框值
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type !== 'button' && input.type !== 'submit') {
                initialState[input.id] = input.value;
            }
        });
        
        // 保存收款单位的显示状态
        const payeeInput = document.getElementById('invoicePayeeInput');
        initialState.payeeInputHidden = payeeInput.classList.contains('hidden');
        
        return initialState;
    }
    
    // 重置模态框到初始状态
    resetInvoiceModalToInitialState(initialState) {
        // 恢复所有字段的值
        Object.keys(initialState).forEach(key => {
            if (key === 'payeeInputHidden') {
                // 恢复收款单位输入框的显示状态
                const payeeInput = document.getElementById('invoicePayeeInput');
                if (initialState[key]) {
                    payeeInput.classList.add('hidden');
                } else {
                    payeeInput.classList.remove('hidden');
                }
            } else {
                // 恢复其他字段的值
                const input = document.getElementById(key);
                if (input) {
                    input.value = initialState[key];
                }
            }
        });
        
        // 手动触发开票单价计算，确保字段值正确
        const amountInput = document.getElementById('invoiceAmount');
        const quantityInput = document.getElementById('invoiceQuantity');
        if (amountInput && quantityInput) {
            // 触发input事件，重新计算开票单价
            amountInput.dispatchEvent(new Event('input'));
        }
    }
    
    // 保存付款记录
    savePaymentRecord(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const record = Object.fromEntries(formData);
        
        // 处理订单号，根据付款类型使用不同的方式
        const paymentType = document.getElementById('paymentType').value;
        if (paymentType === '预付款') {
            // 预付款：使用原来的multiple select方式
            const orderSelect = document.getElementById('paymentOrderNo');
            if (orderSelect) {
                const selectedOptions = Array.from(orderSelect.selectedOptions);
                const orderNos = selectedOptions.map(option => option.value).join(', ');
                record.orderNo = orderNos;
            }
        } else {
            // 其他付款类型：使用搜索输入框的值
            const orderNoSearch = document.getElementById('paymentOrderNoSearch');
            if (orderNoSearch) {
                // 移除可能的尾部逗号，并修剪空格
                record.orderNo = orderNoSearch.value.replace(/,\s*$/, '').trim();
            }
        }
        
        // 确保金额保留2位小数
        if (record.amount) {
            record.amount = parseFloat(record.amount).toFixed(2);
        }
        
        storage.addPaymentRecord(record);
        this.renderPaymentTable();
        this.updateReports();
        this.showNotification('付款记录保存成功', 'success');
        closeModal('paymentModal');
        form.reset();
    }
    
    // 更新报表
    updateReports() {
        // 获取所有记录
        const receiptRecords = storage.getReceiptRecords();
        const invoiceRecords = storage.getInvoiceRecords();
        const paymentRecords = storage.getPaymentRecords();
        
        // 计算年度收汇总额
        const yearlyReceiptTotal = receiptRecords.reduce((total, record) => {
            return total + parseFloat(record.amountInRMB || '0');
        }, 0);
        
        // 计算年度开票总额
        const yearlyInvoiceTotal = invoiceRecords.reduce((total, record) => {
            return total + parseFloat(record.amount || '0');
        }, 0);
        
        // 计算年度付款总额
        const yearlyPaymentTotal = paymentRecords.reduce((total, record) => {
            return total + parseFloat(record.amount || '0');
        }, 0);
        
        // 更新页面显示
        const yearlyReceiptElement = document.getElementById('yearlyReceiptTotal');
        const yearlyInvoiceElement = document.getElementById('yearlyInvoiceTotal');
        const yearlyPaymentElement = document.getElementById('yearlyPaymentTotal');
        
        if (yearlyReceiptElement) {
            yearlyReceiptElement.textContent = `¥${yearlyReceiptTotal.toFixed(2)}`;
        }
        
        if (yearlyInvoiceElement) {
            yearlyInvoiceElement.textContent = `¥${yearlyInvoiceTotal.toFixed(2)}`;
        }
        
        if (yearlyPaymentElement) {
            yearlyPaymentElement.textContent = `¥${yearlyPaymentTotal.toFixed(2)}`;
        }
        
        // 计算总体收汇、开票、付款总额
        const totalReceiptTotal = yearlyReceiptTotal;
        const totalInvoiceTotal = yearlyInvoiceTotal;
        const totalPaymentTotal = yearlyPaymentTotal;
        
        // 更新页面显示
        const totalReceiptElement = document.getElementById('totalReceiptTotal');
        const totalInvoiceElement = document.getElementById('totalInvoiceTotal');
        const totalPaymentElement = document.getElementById('totalPaymentTotal');
        
        if (totalReceiptElement) {
            totalReceiptElement.textContent = `¥${totalReceiptTotal.toFixed(2)}`;
        }
        
        if (totalInvoiceElement) {
            totalInvoiceElement.textContent = `¥${totalInvoiceTotal.toFixed(2)}`;
        }
        
        if (totalPaymentElement) {
            totalPaymentElement.textContent = `¥${totalPaymentTotal.toFixed(2)}`;
        }
    }
    
    // 验证订单号唯一性
    validateOrderNo(orderNo) {
        const records = storage.getOrderRecords();
        return !records.some(record => record.orderNo === orderNo);
    }
    
    // 检查订单号是否存在
    checkOrderNoExists(orderNo) {
        const records = storage.getOrderRecords();
        return records.some(record => record.orderNo === orderNo);
    }
    
    // 应用排序
    applySort(data, sortState) {
        if (!sortState.column) {
            return data;
        }
        
        const { column, direction } = sortState;
        const sortedData = [...data];
        
        sortedData.sort((a, b) => {
            let aVal, bVal;
            
            // 特殊处理状态列
            if (column === 'status') {
                // 检查是否为收汇记录（收汇记录有rate字段）
                const isReceiptRecord = 'rate' in a;
                if (isReceiptRecord) {
                    // 获取所有收汇记录用于计算合计比例
                    const allReceiptRecords = storage.receiptRecords;
                
                // 按订单号分组收汇记录
                const receiptByOrderNo = {};
                allReceiptRecords.forEach(record => {
                    const orderNo = record.orderNo;
                    if (!receiptByOrderNo[orderNo]) {
                        receiptByOrderNo[orderNo] = [];
                    }
                    receiptByOrderNo[orderNo].push(record);
                });
                
                // 计算指定订单号的合计收汇比例
                const calculateTotalRate = (orderNo) => {
                    if (!receiptByOrderNo[orderNo]) return 0;
                    return receiptByOrderNo[orderNo].reduce((sum, receipt) => {
                        const rate = parseFloat(receipt.rate) || 0;
                        return sum + rate;
                    }, 0);
                };
                
                // 获取记录的显示状态
                const getDisplayStatus = (record) => {
                    const orderNo = record.orderNo;
                    const totalRate = calculateTotalRate(orderNo);
                    let chineseStatus;
                    
                    if (totalRate > 0 && totalRate < 100) {
                        chineseStatus = '部分收汇';
                    } else if (totalRate >= 100) {
                        chineseStatus = '收汇完毕';
                    } else {
                        // 默认状态映射
                        const statusMap = {
                            'pending': '待处理',
                            'completed': '已完成',
                            'failed': '失败',
                            '': '未知'
                        };
                        chineseStatus = statusMap[record.status] || statusMap[''];
                    }
                    
                    return chineseStatus;
                };
                
                // 定义状态排序优先级
                const statusPriority = {
                    '待处理': 1,
                    '部分收汇': 2,
                    '收汇完毕': 3,
                    '已完成': 4,
                    '失败': 5,
                    '未知': 6
                };
                
                // 获取排序值
                const aStatus = getDisplayStatus(a);
                const bStatus = getDisplayStatus(b);
                aVal = statusPriority[aStatus] || 999;
                bVal = statusPriority[bStatus] || 999;
                
                // 直接比较状态优先级，跳过后续的日期和数字处理
                let comparison = 0;
                if (aVal < bVal) {
                    comparison = -1;
                } else if (aVal > bVal) {
                    comparison = 1;
                }
                
                return direction === 'asc' ? comparison : -comparison;
                } else {
                    // 发票管理表格的状态列排序
                    // 获取所有付款记录，用于计算付款情况
                    const allPaymentRecords = storage.getPaymentRecords();
                    
                    // 按订单号汇总付款金额
                    const paymentByOrderNo = {};
                    allPaymentRecords.forEach(payment => {
                        if (payment.orderNo) {
                            // 处理付款记录中的多个订单号情况，按逗号分隔
                            const paymentOrderNos = payment.orderNo.split(',').map(no => no.trim()).filter(Boolean);
                            // 将付款金额分配给每个订单号
                            paymentOrderNos.forEach(orderNo => {
                                if (!paymentByOrderNo[orderNo]) {
                                    paymentByOrderNo[orderNo] = 0;
                                }
                                paymentByOrderNo[orderNo] += parseFloat(payment.amount) || 0;
                            });
                        }
                    });
                    
                    // 获取发票的状态
                    const getInvoiceStatus = (record) => {
                        const invoiceAmount = parseFloat(record.amount || 0);
                        // 处理多个订单号情况，按逗号分隔
                        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
                        // 计算所有相关订单的总付款金额
                        const totalPaymentAmount = orderNos.reduce((total, orderNo) => {
                            return total + (paymentByOrderNo[orderNo] || 0);
                        }, 0);
                        
                        if (totalPaymentAmount === 0) {
                            return '未付款';
                        } else if (totalPaymentAmount < invoiceAmount) {
                            return '部分付款';
                        } else {
                            return '已付清';
                        }
                    };
                    
                    // 定义发票状态排序优先级
                    const invoiceStatusPriority = {
                        '未付款': 1,
                        '部分付款': 2,
                        '已付清': 3
                    };
                    
                    // 获取排序值
                const aInvoiceStatus = getInvoiceStatus(a);
                const bInvoiceStatus = getInvoiceStatus(b);
                aVal = invoiceStatusPriority[aInvoiceStatus] || 999;
                bVal = invoiceStatusPriority[bInvoiceStatus] || 999;
                
                // 直接比较状态优先级，跳过后续的日期和数字处理
                let comparison = 0;
                if (aVal < bVal) {
                    comparison = -1;
                } else if (aVal > bVal) {
                    comparison = 1;
                }
                
                return direction === 'asc' ? comparison : -comparison;
                }
            } else if (column === 'followupNo' || column === 'quoteNo' || column === 'contact' || column === 'customerName' || column === 'industry' || column === 'nextFollowup' || column === 'contactDate') {
                // 业务跟踪表格的列处理
                aVal = a[column];
                bVal = b[column];
                
                // 处理空值情况
                if (aVal === null || aVal === undefined || aVal === '') {
                    aVal = column === 'followupNo' ? '0' : '';
                }
                if (bVal === null || bVal === undefined || bVal === '') {
                    bVal = column === 'followupNo' ? '0' : '';
                }
                
                // 跟进单号按字符串排序（日期+随机数格式）
                if (column === 'followupNo') {
                    // 已经是字符串，直接比较
                }
            } else {
                // 常规列处理
                aVal = a[column];
                bVal = b[column];
                
                // 处理空值情况
                if (aVal === null || aVal === undefined || aVal === '') {
                    aVal = '';
                }
                if (bVal === null || bVal === undefined || bVal === '') {
                    bVal = '';
                }
            }
            
            // 辅助函数：将值转换为日期时间戳
            const toTimestamp = (val) => {
                // 如果是数字，可能是Excel日期格式
                if (typeof val === 'number') {
                    // Excel实际上是从1899年12月30日开始计算日期
                    const jsDate = new Date((val - 25568) * 86400000);
                    return jsDate.getTime();
                }
                
                // 如果是字符串，尝试转换为日期
                if (typeof val === 'string') {
                    // 尝试直接转换
                    const jsDate = new Date(val);
                    if (!isNaN(jsDate.getTime())) {
                        return jsDate.getTime();
                    }
                    
                    // 尝试处理其他日期格式（如2025/12/18）
                    const altDate = new Date(val.replace(/\//g, '-'));
                    if (!isNaN(altDate.getTime())) {
                        return altDate.getTime();
                    }
                }
                
                return NaN;
            };
            
            // 处理日期类型，包括Excel数字日期格式
            const aTimestamp = toTimestamp(aVal);
            const bTimestamp = toTimestamp(bVal);
            
            if (!isNaN(aTimestamp) && !isNaN(bTimestamp)) {
                aVal = aTimestamp;
                bVal = bTimestamp;
            } else {
                // 处理数字类型
                const aNum = parseFloat(aVal);
                const bNum = parseFloat(bVal);
                
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    aVal = aNum;
                    bVal = bNum;
                }
            }
            
            // 比较
            let comparison = 0;
            if (aVal < bVal) {
                comparison = -1;
            } else if (aVal > bVal) {
                comparison = 1;
            }
            
            // 根据方向调整结果
            return direction === 'asc' ? comparison : -comparison;
        });
        
        return sortedData;
    }
    
    // 处理排序
    handleSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.order.column === column) {
            this.sortState.order.direction = this.sortState.order.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.order.column = column;
            this.sortState.order.direction = 'asc';
        }
        
        // 重新渲染表格
        if (this.currentActiveTab === 'order') {
            this.renderOrderTable();
        }
    }
    
    // 处理收汇管理表格排序
    handleReceiptTableSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.receipt.column === column) {
            this.sortState.receipt.direction = this.sortState.receipt.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.receipt.column = column;
            this.sortState.receipt.direction = 'asc';
        }
        
        // 重新渲染收汇管理表格
        this.renderReceiptTable();
    }
    
    // 处理出口管理表格排序
    handleExportTableSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.export.column === column) {
            this.sortState.export.direction = this.sortState.export.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.export.column = column;
            this.sortState.export.direction = 'asc';
        }
        
        // 重新渲染出口管理表格
        this.renderExportTable();
    }
    
    // 处理发票管理表格排序
    handleInvoiceTableSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.invoice.column === column) {
            this.sortState.invoice.direction = this.sortState.invoice.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.invoice.column = column;
            this.sortState.invoice.direction = 'asc';
        }
        
        // 重新渲染发票管理表格
        this.renderInvoiceTable();
    }
    
    // 处理账务管理表格排序
    handlePaymentTableSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.payment.column === column) {
            this.sortState.payment.direction = this.sortState.payment.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.payment.column = column;
            this.sortState.payment.direction = 'asc';
        }

        // 重新渲染账务管理表格
        this.renderPaymentTable();
    }

    // 处理业务跟踪表格排序
    handleBusinessTableSort(column) {
        // 如果点击的是当前排序列，则切换排序方向
        if (this.sortState.business.column === column) {
            this.sortState.business.direction = this.sortState.business.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 否则设置新的排序列和默认方向
            this.sortState.business.column = column;
            this.sortState.business.direction = 'desc';
        }

        // 重新加载业务跟踪列表
        loadBusinessList();
    }

    // 收汇管理全局搜索函数
    handleReceiptGlobalSearch() {
        const searchInputValue = document.getElementById('receiptGlobalSearch').value;
        
        // 支持多词搜索，词与词之间用英文逗号分隔
        const searchTerms = searchInputValue.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
        
        let records = storage.getReceiptRecords();
        
        if (searchTerms.length > 0) {
            // 筛选出包含任意一个搜索关键词的记录
            records = records.filter(record => {
                return searchTerms.some(term => {
                    return Object.values(record).some(value => {
                        if (value === null || value === undefined) return false;
                        return value.toString().toLowerCase().includes(term);
                    });
                });
            });
        }
        
        // 应用客户筛选
        const customerFilter = document.getElementById('receiptCustomerSearch').value;
        if (customerFilter) {
            records = records.filter(record => record.customer === customerFilter);
        }
        
        // 应用状态筛选 - 与表格渲染逻辑一致，根据订单号的合计收汇比例计算
        const statusFilter = document.getElementById('receiptStatusFilter').value;
        if (statusFilter) {
            // 计算每个订单号的合计收汇比例（与表格渲染一致）
            const receiptByOrderNo = {};
            const orderTotalRates = {};
            
            records.forEach(r => {
                const orderNo = r.orderNo;
                if (!receiptByOrderNo[orderNo]) {
                    receiptByOrderNo[orderNo] = [];
                }
                receiptByOrderNo[orderNo].push(r);
            });
            
            Object.keys(receiptByOrderNo).forEach(orderNo => {
                const receipts = receiptByOrderNo[orderNo];
                const totalRate = receipts.reduce((sum, receipt) => {
                    const rate = parseFloat(receipt.rate) || 0;
                    return sum + rate;
                }, 0);
                orderTotalRates[orderNo] = totalRate;
            });
            
            records = records.filter(record => {
                // 获取记录的显示状态（与表格中显示的状态一致）
                const orderNo = record.orderNo;
                const totalRate = orderTotalRates[orderNo] || 0;
                let recordDisplayStatus = '';
                
                if (totalRate > 0 && totalRate < 100) {
                    recordDisplayStatus = '部分收汇';
                } else if (totalRate >= 100) {
                    recordDisplayStatus = '收汇完毕';
                } else {
                    const statusMap = {
                        'pending': '待处理',
                        'completed': '已完成',
                        'failed': '失败',
                        '': '未知',
                        'receipt_completed': '收汇完毕'
                    };
                    recordDisplayStatus = statusMap[record.status] || '未知';
                }
                
                return recordDisplayStatus === statusFilter;
            });
        }
        
        // 应用日期筛选
        const dateFrom = document.getElementById('receiptDateFrom').value;
        const dateTo = document.getElementById('receiptDateTo').value;
        if (dateFrom) {
            records = records.filter(record => new Date(record.receiptDate) >= new Date(dateFrom));
        }
        if (dateTo) {
            records = records.filter(record => new Date(record.receiptDate) <= new Date(dateTo));
        }
        
        // 渲染筛选后的表格
        this.renderReceiptTable(records);
    }
    
    // 更新订单表格表头排序状态
    updateOrderTableHeaderSortState() {
        const { column, direction } = this.sortState.order;
        const headers = document.querySelectorAll('#orderTab .data-table th');
        
        // 列映射：表头文本到数据字段名
        const columnMap = {
            '状态': 'status',
            '订单日期': 'orderDate',
            '客户': 'customer',
            '订单号': 'orderNo',
            '交货日期': 'deliveryDate',
            '交易条款': 'tradeTerms',
            '付款方式': 'paymentMethod',
            '运输方式': 'transportMethod',
            '产品名称': 'productName',
            '规格': 'spec',
            '图号': 'drawingNo',
            '电镀': 'plating',
            'LOGO': 'logo',
            '单位': 'unit',
            '单价': 'unitPrice',
            '数量': 'quantity',
            '金额': 'amount',
            '货币': 'currency'
        };
        
        // 移除所有表头的排序指示器
        headers.forEach(header => {
            header.innerHTML = header.innerHTML.replace(/\s*(↑|↓)$/, '');
        });
        
        // 如果有当前排序列，添加对应的排序指示器
        if (column) {
            // 查找对应的表头
            for (const [headerText, fieldName] of Object.entries(columnMap)) {
                if (fieldName === column) {
                    // 找到对应的表头元素
                    headers.forEach(header => {
                        if (header.textContent.trim() === headerText) {
                            // 添加排序指示器
                            const indicator = direction === 'asc' ? ' ↑' : ' ↓';
                            header.innerHTML = header.innerHTML.trim() + indicator;
                        }
                    });
                    break;
                }
            }
        }
    }
};

// 初始化页面控制器
const pageController = new PageController();

// 初始化客户标签筛选功能
function initCustomerTagFilter() {
    const tagContainer = document.getElementById('customer-group-tags');
    if (!tagContainer) return;
    
    // 为所有标签添加点击事件
    tagContainer.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON' && e.target.hasAttribute('data-filter')) {
            // 更新标签激活状态
            tagContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('bg-blue-700'));
            tagContainer.querySelectorAll('button').forEach(btn => btn.classList.add('bg-blue-600'));
            e.target.classList.remove('bg-blue-600');
            e.target.classList.add('bg-blue-700');
            
            // 获取当前的国家筛选值
            const countryFilter = document.getElementById('country-filter');
            const country = countryFilter ? countryFilter.value : 'all';
            
            // 应用国家筛选
            filterCustomersByCountry(country);
        }
    });
}

// 初始化客户搜索功能
function initCustomerSearch() {
    const searchInput = document.getElementById('customer-search-input');
    if (!searchInput) return;
    
    // 为搜索输入框添加input事件监听器，实现实时搜索
    searchInput.addEventListener('input', function(e) {
        // 获取当前的国家筛选值
        const countryFilter = document.getElementById('country-filter');
        const country = countryFilter ? countryFilter.value : 'all';
        
        // 应用国家筛选
        filterCustomersByCountry(country);
    });
}

// 初始化下拉菜单功能
function initDropdowns() {
    // 为所有一级下拉菜单按钮添加点击事件
    document.querySelectorAll('.relative > .btn-secondary').forEach(btn => {
        btn.addEventListener('click', function(e) {
            // 阻止事件冒泡
            e.stopPropagation();
            
            // 关闭所有其他一级下拉菜单
            document.querySelectorAll('.relative > .btn-secondary + div').forEach(menu => {
                if (menu !== this.nextElementSibling) {
                    menu.classList.add('hidden');
                }
            });
            
            // 切换当前下拉菜单的显示状态
            const menu = this.nextElementSibling;
            if (menu) {
                menu.classList.toggle('hidden');
            }
        });
    });
    
    // 为所有二级下拉菜单添加悬停事件
    document.querySelectorAll('.relative.group .relative').forEach(parent => {
        parent.addEventListener('mouseenter', function() {
            const submenu = this.querySelector('div:last-child');
            if (submenu) {
                submenu.classList.remove('hidden');
            }
        });
        
        parent.addEventListener('mouseleave', function() {
            const submenu = this.querySelector('div:last-child');
            if (submenu) {
                submenu.classList.add('hidden');
            }
        });
    });
    
    // 点击页面其他地方关闭所有下拉菜单
    document.addEventListener('click', function() {
        document.querySelectorAll('.relative > .btn-secondary + div').forEach(menu => {
            menu.classList.add('hidden');
        });
    });
}

// 格式化日期
function formatDate(dateValue) {
    if (!dateValue) return '';
    
    // 如果是数字，可能是Excel日期格式
    if (typeof dateValue === 'number') {
        // Excel实际上是从1899年12月30日开始计算日期，所以天数差应该是25568而不是25569
        const excelDate = dateValue;
        const jsDate = new Date((excelDate - 25568) * 86400000);
        // 使用本地时间构建日期字符串，避免时区转换
        const year = jsDate.getFullYear();
        const month = String(jsDate.getMonth() + 1).padStart(2, '0');
        const day = String(jsDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // 如果是字符串，直接返回
    return dateValue;
}

// 清空所有订单记录
function clearAllOrders() {
    if (confirm('确定要清空所有订单记录吗？此操作不可恢复！')) {
        storage.orderRecords = [];
        // 清空跨页选中状态
        clearSelectedOrderIds();

        // 重置分页数据，确保表格立即清空
        paginations.order.setData([]);
        pageController.renderOrderTable();
        pageController.showNotification('所有订单记录已清空', 'success');
    }
}

// 清空所有客户记录
function clearAllCustomers() {
    if (confirm('确定要清空所有通讯录记录吗？此操作不可恢复！')) {
        // 清空客户记录
        storage.customerRecords = [];
    
        // 更新分页数据并重新渲染
        paginations.customer.setData([]);
        pageController.renderCustomerTable();
        // 显示成功通知
        pageController.showNotification('所有通讯录记录已清空', 'success');
    }
}

// 清空所有收汇记录
function clearAllReceipts() {
    if (confirm('确定要清空所有收汇记录吗？此操作不可恢复！')) {
        // 清空收汇记录
        storage.receiptRecords = [];
    
        // 更新分页数据并重新渲染
        paginations.receipt.setData([]);
        pageController.renderReceiptTable();
        // 显示成功通知
        pageController.showNotification('所有收汇记录已清空', 'success');
    }
}

// 清空所有出口记录
function clearAllExportRecords() {
    if (confirm('确定要清空所有出口记录吗？此操作不可恢复！')) {
        // 清空出口记录
        storage.exportRecords = [];
    
        // 更新分页数据并重新渲染
        paginations.export.setData([]);
        pageController.renderExportTable();
        // 显示成功通知
        pageController.showNotification('所有出口记录已清空', 'success');
    }
}

// 编辑出口记录
function editExport(id) {
    // 获取要编辑的出口记录
    const exportRecords = storage.getExportRecords();
    const record = exportRecords.find(item => item.id === id);
    
    if (!record) {
        pageController.showNotification('未找到该出口记录', 'error');
        return;
    }
    
    // 填充表单数据
    document.getElementById('editExportId').value = record.id;
    document.getElementById('editExportDate').value = record.exportDate || '';
    document.getElementById('editExportShipment').value = record.shippingNo || '';
    document.getElementById('editExportOrder').value = record.orderNo || '';
    document.getElementById('editExportCustomer').value = record.customer || '';
    document.getElementById('editExportQuantity').value = record.quantity || '';
    document.getElementById('editExportDeclarationAmount').value = record.declarationAmount || '';
    document.getElementById('editExportArrivalDate').value = record.arrivalDate || '';
    document.getElementById('editExportVessel').value = record.shipName || '';
    document.getElementById('editExportContainer').value = record.containerNo || '';
    document.getElementById('editExportBillNo').value = record.billNo || '';
    document.getElementById('editExportRemark').value = record.remark || '';
    
    // 打开编辑模态框
    openModal('editExportModal');
}

// 保存编辑后的出口记录
function saveEditExportRecord(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const record = {};
    
    // 处理表单数据
    for (const [key, value] of formData.entries()) {
        if (key === 'shipmentNo') {
            // 运编号映射到shippingNo
            record.shippingNo = value;
        } else if (key === 'vesselVoyage') {
            // 船名航次映射到shipName
            record.shipName = value;
        } else if (key === 'containerSeal') {
            // 集装箱号封号映射到containerNo
            record.containerNo = value;
        } else if (key === 'declarationAmount') {
            // 报关金额保留两位小数
            record[key] = parseFloat(value) ? parseFloat(value).toFixed(2) : '';
        } else if (key === 'quantity') {
            // 数量保留两位小数
            record[key] = parseFloat(value) ? parseFloat(value).toFixed(2) : '';
        } else {
            record[key] = value;
        }
    }
    
    // 获取当前所有出口记录
    const exportRecords = storage.getExportRecords();
    // 查找要更新的记录索引
    const index = exportRecords.findIndex(item => item.id === record.id);
    
    if (index === -1) {
        pageController.showNotification('未找到该出口记录', 'error');
        return;
    }
    
    // 更新记录
    exportRecords[index] = record;
    // 保存到存储
    storage.exportRecords = exportRecords;
    
    // 获取最新的出口记录数据并更新分页对象
    const latestRecords = storage.getExportRecords();
    paginations.export.updateData(latestRecords);
    
    // 更新表格
    pageController.renderExportTable();
    // 显示成功通知
    pageController.showNotification('出口记录更新成功', 'success');
    // 关闭模态框
    closeModal('editExportModal');
    // 重置表单
    form.reset();
}

// 删除出口记录
function deleteExport(id) {
    if (confirm('确定要删除这条出口记录吗？此操作不可恢复！')) {
        // 获取当前所有出口记录
        const exportRecords = storage.getExportRecords();
        // 过滤掉要删除的记录
        const updatedRecords = exportRecords.filter(item => item.id !== id);
        // 保存到存储
        storage.exportRecords = updatedRecords;
        
        // 更新表格
        pageController.renderExportTable();
        // 显示成功通知
        pageController.showNotification('出口记录删除成功', 'success');
    }
}

// 计算收汇比例
function calculateReceiptRate() {
    // 获取订单号、收汇金额和手续费
    const orderNo = document.getElementById('receiptOrderNo').value;
    const amountReceived = parseFloat(document.getElementById('receiptAmountReceived').value);
    const fee = parseFloat(document.getElementById('receiptFee').value) || 0;
    
    if (!orderNo || isNaN(amountReceived)) {
        document.getElementById('receiptRate').value = '';
        return;
    }
    
    // 从订单记录中查找对应订单号的所有记录，并汇总金额
    const orderRecords = storage.orderRecords;
    const orderRecordsWithSameNo = orderRecords.filter(record => record.orderNo === orderNo);
    
    if (orderRecordsWithSameNo.length === 0) {
        document.getElementById('receiptRate').value = '';
        return;
    }
    
    // 汇总同一订单号下所有记录的金额
    const totalOrderAmount = orderRecordsWithSameNo.reduce((sum, record) => {
        const amount = parseFloat(record.amount) || 0;
        return sum + amount;
    }, 0);
    
    if (isNaN(totalOrderAmount) || totalOrderAmount === 0) {
        document.getElementById('receiptRate').value = '';
        return;
    }
    
    // 计算比例并添加百分号：(收汇金额 + 手续费) / 订单总金额 * 100%
    const rate = ((amountReceived + fee) / totalOrderAmount * 100).toFixed(2) + '%';
    document.getElementById('receiptRate').value = rate;
}

// 更新新增收汇模态框的订单号选项
function updateAddOrderNoOptions() {
    const customerSelect = document.getElementById('addReceiptCustomer');
    const orderNoSelect = document.getElementById('addReceiptOrderNo');
    
    if (!customerSelect || !orderNoSelect) {
        return;
    }
    
    // 获取选中的客户
    const selectedCustomer = customerSelect.value;
    
    // 获取订单记录
    const orderRecords = storage.orderRecords;
    
    // 清空当前订单号选项
    orderNoSelect.innerHTML = '<option value="">请选择订单号</option>';
    
    // 根据选中的客户筛选订单
    const filteredOrders = selectedCustomer 
        ? orderRecords.filter(order => order.customer === selectedCustomer)
        : orderRecords;
    
    // 按订单号倒序排列
    filteredOrders.sort((a, b) => b.orderNo.localeCompare(a.orderNo));
    
    // 添加筛选后的订单号选项
    filteredOrders.forEach(order => {
        const option = document.createElement('option');
        option.value = order.orderNo;
        option.textContent = order.orderNo;
        orderNoSelect.appendChild(option);
    });
    
    // 更新收汇金额提示
    updateAddReceiptAmountTooltip();
}

// 更新新增收汇模态框的收汇金额悬停提示
function updateAddReceiptAmountTooltip() {
    const orderNoSelect = document.getElementById('addReceiptOrderNo');
    const tooltip = document.getElementById('addReceiptAmountTooltip');
    
    if (!orderNoSelect || !tooltip) {
        return;
    }
    
    // 获取选中的订单号
    const selectedOrderNo = orderNoSelect.value;
    
    if (!selectedOrderNo) {
        tooltip.textContent = '请选择订单号查看欠款金额';
        return;
    }
    
    // 从订单记录中查找对应订单号的所有记录，并汇总金额
    const orderRecords = storage.orderRecords;
    const orderRecordsWithSameNo = orderRecords.filter(record => record.orderNo === selectedOrderNo);
    
    if (orderRecordsWithSameNo.length === 0) {
        tooltip.textContent = '订单金额未找到';
        return;
    }
    
    // 汇总同一订单号下所有记录的金额
    const totalOrderAmount = orderRecordsWithSameNo.reduce((sum, record) => {
        const amount = parseFloat(record.amount) || 0;
        return sum + amount;
    }, 0);
    
    // 获取订单货币（使用第一条记录的货币）
    const currency = orderRecordsWithSameNo[0].currency || 'USD';
    
    // 自动填充货币下拉框
    const currencySelect = document.getElementById('addReceiptCurrency');
    if (currencySelect) {
        currencySelect.value = currency;
    }
    
    // 计算该订单号下已收汇的总金额
    const receiptRecords = storage.receiptRecords;
    const receiptRecordsWithSameNo = receiptRecords.filter(record => record.orderNo === selectedOrderNo);
    
    const totalReceived = receiptRecordsWithSameNo
        .reduce((sum, record) => sum + (parseFloat(record.amountReceived) || 0), 0);
    
    // 计算手续费合计
    const totalFee = receiptRecordsWithSameNo
        .reduce((sum, record) => sum + (parseFloat(record.fee) || 0), 0);
    
    // 使用四舍五入避免浮点数精度问题
    const roundedTotalReceived = Math.round(totalReceived * 100) / 100;
    const roundedTotalFee = Math.round(totalFee * 100) / 100;
    const remainingAmount = Math.round((totalOrderAmount - roundedTotalReceived - roundedTotalFee) * 100) / 100;
    
    // 更新提示词
    tooltip.textContent = `欠款金额：${remainingAmount.toFixed(2)} ${currency}`;
}

// 计算新增收汇模态框的收汇比例
function calculateAddReceiptRate() {
    // 获取订单号、收汇金额和手续费
    const orderNo = document.getElementById('addReceiptOrderNo').value;
    const amountReceived = parseFloat(document.getElementById('addReceiptAmountReceived').value);
    const fee = parseFloat(document.getElementById('addReceiptFee').value) || 0;
    
    if (!orderNo || isNaN(amountReceived)) {
        document.getElementById('addReceiptRate').value = '';
        return;
    }
    
    // 从订单记录中查找对应订单号的所有记录，并汇总金额
    const orderRecords = storage.orderRecords;
    const orderRecordsWithSameNo = orderRecords.filter(record => record.orderNo === orderNo);
    
    if (orderRecordsWithSameNo.length === 0) {
        document.getElementById('addReceiptRate').value = '';
        return;
    }
    
    // 汇总同一订单号下所有记录的金额
    const totalOrderAmount = orderRecordsWithSameNo.reduce((sum, record) => {
        const amount = parseFloat(record.amount) || 0;
        return sum + amount;
    }, 0);
    
    if (isNaN(totalOrderAmount) || totalOrderAmount === 0) {
        document.getElementById('addReceiptRate').value = '';
        return;
    }
    
    // 计算比例并添加百分号：(收汇金额 + 手续费) / 订单总金额 * 100%
    const rate = ((amountReceived + fee) / totalOrderAmount * 100).toFixed(2) + '%';
    document.getElementById('addReceiptRate').value = rate;
}

// 计算已勾选订单的金额合计
// 获取当前筛选数据中已选中的订单ID数组（自动剔除已不存在的陈旧ID）
function getSelectedOrderIds() {
    const filteredIds = new Set(paginations.order.filteredData.map(o => o.id));
    return [...selectedOrderIds].filter(id => filteredIds.has(id));
}

// 同步当前页复选框与全选复选框的显示状态（分页切换后调用）
function syncOrderCheckboxStates() {
    document.querySelectorAll('.order-checkbox').forEach(cb => {
        cb.checked = selectedOrderIds.has(cb.getAttribute('data-id'));
    });
    updateOrderSelectAllCheckboxState();
}

// 根据当前筛选数据更新全选复选框状态（全选所有页语义）
function updateOrderSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('selectAllOrders');
    if (!selectAllCheckbox) return;
    const filteredIds = paginations.order.filteredData.map(o => o.id);
    if (filteredIds.length === 0) {
        selectAllCheckbox.checked = false;
        return;
    }
    selectAllCheckbox.checked = filteredIds.every(id => selectedOrderIds.has(id));
}

// 清空订单选中状态
function clearSelectedOrderIds() {
    selectedOrderIds.clear();
}

function calculateSelectedOrderAmount() {
    const selectedIds = getSelectedOrderIds();
    let totalAmount = 0;
    let totalQuantity = 0;

    selectedIds.forEach(orderId => {
        const order = paginations.order.filteredData.find(o => o.id === orderId);
        if (order) {
            const amount = parseFloat(order.amount || 0);
            totalAmount += isNaN(amount) ? 0 : amount;
            const quantity = parseFloat(order.quantity || 0);
            totalQuantity += isNaN(quantity) ? 0 : quantity;
        }
    });

    return { totalAmount, totalQuantity };
}

// 全选/全不选功能
function toggleSelectAll(checked) {
    document.querySelectorAll('.order-checkbox').forEach(checkbox => {
        checkbox.checked = checked;
    });
    updateSelectedOrderAmount();
}

// 更新已勾选订单的金额合计和数量合计（跨页选中合计）
function updateSelectedOrderAmount() {
    const { totalAmount, totalQuantity } = calculateSelectedOrderAmount();
    const selectedCount = getSelectedOrderIds().length;
    const orderCountWrapper = document.getElementById('orderCountWrapper');

    if (orderCountWrapper) {
        // 移除旧的已勾选金额合计显示
        const oldSelectedInfo = orderCountWrapper.querySelector('.selected-amount-info');
        if (oldSelectedInfo) {
            oldSelectedInfo.remove();
        }

        // 如果有已勾选的记录，添加新的显示
        if (selectedCount > 0) {
            const selectedInfo = document.createElement('span');
            selectedInfo.className = 'selected-amount-info';
            selectedInfo.innerHTML = ` <span class="text-gray-500">|</span> 已选: <strong style="color: #059669;">${selectedCount}</strong> 条 <span class="text-gray-500">|</span> 已勾选数量合计: <strong style="color: #059669;">${totalQuantity.toFixed(2)}</strong> <span class="text-gray-500">|</span> 已勾选金额合计: <strong style="color: #059669;">${totalAmount.toFixed(2)}</strong>`;
            orderCountWrapper.appendChild(selectedInfo);
        }
    }
}

// 批量处理更新功能
function processBatchUpdate(e) {
    e.preventDefault();
    
    const field = document.getElementById('batchField').value;
    const oldValue = document.getElementById('batchOldValue').value.trim();
    const newValue = document.getElementById('batchNewValue').value;
    
    if (!newValue) {
        pageController.showNotification('请选择新值', 'error');
        return;
    }
    
    // 获取所有选中的订单记录（支持跨页选中）
    const selectedIds = getSelectedOrderIds();
    const selectedOrders = paginations.order.filteredData.filter(o => selectedIds.includes(o.id));

    if (selectedOrders.length === 0) {
        pageController.showNotification('请先选择要修改的订单记录', 'error');
        return;
    }
    
    // 字段名称映射，用于显示消息
    const fieldNames = {
        tradeTerms: '交易条款',
        paymentMethod: '付款方式',
        transportMethod: '运输方式',
        currency: '货币',
        status: '状态'
    };
    
    // 更新选中记录
    let updatedCount = 0;
    storage.orderRecords = storage.orderRecords.map(record => {
        // 检查是否为选中的记录
        if (selectedOrders.some(selected => selected.id === record.id)) {
            // 如果旧值为空，直接更新；否则只有当旧值匹配时才更新
            if (!oldValue || record[field] === oldValue) {
                updatedCount++;
                return {
                    ...record,
                    [field]: newValue
                };
            }
        }
        return record;
    });
    
    storage.saveAll();
    // 批量修改后清空选中状态，避免对已变更数据重复操作
    clearSelectedOrderIds();
    pageController.renderOrderTable();
    pageController.showNotification(`成功修改${updatedCount}条记录的${fieldNames[field]}`, 'success');
    closeModal('batchProcessModal');

    // 重置表单
    document.getElementById('batchProcessForm').reset();
}

// 打开批量处理模态框
function openBatchProcessModal() {
    openModal('batchProcessModal');
    // 初始化新值下拉框
    updateBatchNewValueOptions();

    // 为选择字段添加change事件监听器
    const batchField = document.getElementById('batchField');
    batchField.removeEventListener('change', updateBatchNewValueOptions); // 避免重复添加
    batchField.addEventListener('change', updateBatchNewValueOptions);
}

// 批量修改客户：获取所有可选客户名称（来自订单记录与客户通讯录）
function getBatchCustomerList() {
    const orderCustomers = storage.getOrderRecords().map(o => o.customer).filter(Boolean);
    const addrCustomers = storage.getCustomerRecords().map(c => c.customerName).filter(Boolean);
    return [...new Set([...orderCustomers, ...addrCustomers])];
}

// 打开批量修改客户模态框
function openBatchCustomerModal() {
    const selectedCount = getSelectedOrderIds().length;

    // 显示已选中订单数量（跨页选中合计）
    const countEl = document.getElementById('batchCustomerSelectedCount');
    if (countEl) countEl.textContent = selectedCount;

    // 重置输入与建议列表
    const input = document.getElementById('batchCustomerName');
    if (input) input.value = '';
    const suggestions = document.getElementById('batchCustomerSuggestions');
    if (suggestions) {
        suggestions.classList.add('hidden');
        suggestions.innerHTML = '';
    }

    openModal('batchCustomerModal');
}

// 渲染批量修改客户建议列表
function renderBatchCustomerSuggestions(customers) {
    const suggestions = document.getElementById('batchCustomerSuggestions');
    if (!suggestions) return;
    suggestions.innerHTML = '';

    if (customers.length === 0) {
        suggestions.classList.add('hidden');
        return;
    }

    suggestions.classList.remove('hidden');
    customers.forEach(customer => {
        const div = document.createElement('div');
        div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
        div.textContent = customer;
        div.addEventListener('click', () => {
            const input = document.getElementById('batchCustomerName');
            if (input) input.value = customer;
            suggestions.classList.add('hidden');
        });
        suggestions.appendChild(div);
    });
}

// 批量修改客户：筛选建议
function filterBatchCustomers(searchTerm) {
    if (!searchTerm) {
        // 空值时显示全部
        renderBatchCustomerSuggestions(getBatchCustomerList());
        return;
    }
    const filtered = getBatchCustomerList().filter(customer =>
        customer.toLowerCase().includes(searchTerm.toLowerCase())
    );
    renderBatchCustomerSuggestions(filtered);
}

// 批量修改客户：显示全部建议
function showBatchCustomerSuggestions() {
    renderBatchCustomerSuggestions(getBatchCustomerList());
}

// 批量修改客户：提交处理
function processBatchCustomerUpdate(e) {
    e.preventDefault();

    const newValue = document.getElementById('batchCustomerName').value.trim();
    if (!newValue) {
        pageController.showNotification('请输入新客户名称', 'error');
        return;
    }

    // 获取选中的订单ID（支持跨页选中）
    const selectedIds = getSelectedOrderIds();
    if (selectedIds.length === 0) {
        pageController.showNotification('请先选择要修改的订单记录', 'error');
        return;
    }

    // 更新选中记录的客户字段
    let updatedCount = 0;
    storage.orderRecords = storage.orderRecords.map(record => {
        if (selectedIds.includes(record.id)) {
            updatedCount++;
            return { ...record, customer: newValue };
        }
        return record;
    });

    storage.saveAll();
    // 批量修改后清空选中状态，避免对已变更数据重复操作
    clearSelectedOrderIds();
    pageController.renderOrderTable();
    pageController.showNotification(`成功修改 ${updatedCount} 条订单的客户为「${newValue}」`, 'success');
    closeModal('batchCustomerModal');

    // 重置表单
    const form = document.getElementById('batchCustomerForm');
    if (form) form.reset();
}

// 根据选择的字段类型更新新值下拉框选项
function updateBatchNewValueOptions() {
    const fieldSelect = document.getElementById('batchField');
    const newValueSelect = document.getElementById('batchNewValue');
    const fieldValue = fieldSelect.value;
    
    // 清空现有选项
    newValueSelect.innerHTML = '';
    
    // 定义各字段的选项
    const fieldOptions = {
        tradeTerms: [
            { value: 'EXW', text: 'EXW' },
            { value: 'FOB', text: 'FOB' },
            { value: 'CIF', text: 'CIF' },
            { value: 'CFR', text: 'CFR' },
            { value: 'DDU', text: 'DDU' },
            { value: 'DDP', text: 'DDP' },
            { value: '其他', text: '其他' }
        ],
        paymentMethod: [
            { value: 'TT', text: 'TT' },
            { value: 'L/C', text: 'L/C' },
            { value: 'D/P', text: 'D/P' },
            { value: '其他', text: '其他' }
        ],
        transportMethod: [
            { value: '海运', text: '海运' },
            { value: '空运', text: '空运' },
            { value: '陆运', text: '陆运' },
            { value: '快递', text: '快递' }
        ],
        currency: [
            { value: 'CNY', text: 'CNY' },
            { value: 'USD', text: 'USD' },
            { value: 'EUR', text: 'EUR' },
            { value: 'GBP', text: 'GBP' }
        ],
        status: [
            { value: '待生产', text: '待生产' },
            { value: '生产中', text: '生产中' },
            { value: '已出货', text: '已出货' }
        ]
    };
    
    // 添加新选项
    fieldOptions[fieldValue].forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.text;
        newValueSelect.appendChild(opt);
    });
}

// 搜索订单
function searchOrdersInTable(searchTerm) {
    // 获取所有订单记录
    const allOrders = storage.getOrderRecords();
    
    // 如果搜索词为空，显示所有记录
    if (!searchTerm.trim()) {
        pageController.renderOrderTable();
        return;
    }
    
    // 支持多词搜索，词与词之间用英文逗号分隔
    const searchTerms = searchTerm.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    
    // 过滤订单记录，检查所有字段
    const filteredOrders = allOrders.filter(order => {
        // 检查是否包含任意一个搜索词
        return searchTerms.some(term => {
            // 检查所有字段是否包含搜索词
            return (
                (order.status || '').toString().toLowerCase().includes(term) ||
                (order.orderDate || '').toString().toLowerCase().includes(term) ||
                (order.customer || '').toString().toLowerCase().includes(term) ||
                (order.orderNo || '').toString().toLowerCase().includes(term) ||
                (order.deliveryDate || '').toString().toLowerCase().includes(term) ||
                (order.tradeTerms || '').toString().toLowerCase().includes(term) ||
                (order.paymentMethod || '').toString().toLowerCase().includes(term) ||
                (order.transportMethod || '').toString().toLowerCase().includes(term) ||
                (order.productName || '').toString().toLowerCase().includes(term) ||
            (order.spec || '').toString().toLowerCase().includes(term) ||
            (order.drawingNo || '').toString().toLowerCase().includes(term) ||
            (order.plating || '').toString().toLowerCase().includes(term) ||
            (order.logo || '').toString().toLowerCase().includes(term) ||
            (order.unit || '').toString().toLowerCase().includes(term) ||
            (order.quantity || '').toString().toLowerCase().includes(term) ||
            (order.unitPrice || '').toString().toLowerCase().includes(term) ||
            (order.amount || '').toString().toLowerCase().includes(term) ||
            (order.currency || '').toString().toLowerCase().includes(term) ||
            (order.packing || '').toString().toLowerCase().includes(term) ||
            (order.remark || '').toString().toLowerCase().includes(term)
            );
        });
    });
    
    // 更新表格
    pageController.renderOrderTable(filteredOrders);
}

// 搜索出口记录
function searchExportTable(searchTerm) {
    // 获取所有出口记录
    const allExportRecords = storage.getExportRecords();
    
    // 如果搜索词为空，显示所有记录
    if (!searchTerm.trim()) {
        pageController.renderExportTable();
        return;
    }
    
    // 支持多词搜索，词与词之间用英文逗号分隔
    const searchTerms = searchTerm.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    
    // 过滤出口记录，检查所有字段
    const filteredExportRecords = allExportRecords.filter(record => {
        // 检查是否包含任意一个搜索词
        return searchTerms.some(term => {
            // 检查所有字段是否包含搜索词
            return (
                (record.status || '').toString().toLowerCase().includes(term) ||
                (record.exportDate || '').toString().toLowerCase().includes(term) ||
                (record.arrivalDate || '').toString().toLowerCase().includes(term) ||
                (record.customer || '').toString().toLowerCase().includes(term) ||
            (record.orderNo || '').toString().toLowerCase().includes(term) ||
            (record.shippingNo || '').toString().toLowerCase().includes(term) ||
            (record.shipName || '').toString().toLowerCase().includes(term) ||
            (record.containerNo || '').toString().toLowerCase().includes(term) ||
            (record.billNo || '').toString().toLowerCase().includes(term) ||
            (record.currency || '').toString().toLowerCase().includes(term) ||
            (record.declarationAmount || '').toString().toLowerCase().includes(term) ||
            (record.remark || '').toString().toLowerCase().includes(term)
            );
        });
    });
    
    // 更新表格
    pageController.renderExportTable(filteredExportRecords);
}

// 出口管理页面客户搜索建议
function filterExportCustomers(searchTerm) {
    const suggestions = document.getElementById('exportCustomerSuggestions');
    if (!suggestions) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取所有客户名称
    const allExportRecords = storage.getExportRecords();
    const customers = [...new Set(allExportRecords.map(record => record.customer).filter(Boolean))];
    
    // 筛选匹配的客户
    const filteredCustomers = customers.filter(customer => 
        customer.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filteredCustomers.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        filteredCustomers.forEach(customer => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = customer;
            div.addEventListener('click', () => {
                document.getElementById('exportCustomerSearch').value = customer;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示出口管理页面客户搜索建议
function showExportCustomerSuggestions() {
    const suggestions = document.getElementById('exportCustomerSuggestions');
    if (suggestions) {
        const searchTerm = document.getElementById('exportCustomerSearch').value;
        if (searchTerm) {
            filterExportCustomers(searchTerm);
        }
    }
}

// 搜索出口记录
function searchExportRecords() {
    const customer = document.getElementById('exportCustomerSearch').value;
    const dateType = document.getElementById('exportDateType').value;
    const dateFrom = document.getElementById('exportDateFrom').value;
    const dateTo = document.getElementById('exportDateTo').value;
    const statusFilter = document.getElementById('exportStatusFilter').value;
    
    // 获取所有出口记录和发票记录
    const allExportRecords = storage.getExportRecords();
    const invoiceRecords = storage.getInvoiceRecords();
    
    // 从发票记录中提取所有订单号
    const invoicedOrderNos = new Set();
    invoiceRecords.forEach(invoice => {
        if (invoice.orderNo) {
            const orderNos = invoice.orderNo.split(',').map(no => no.trim()).filter(Boolean);
            orderNos.forEach(orderNo => invoicedOrderNos.add(orderNo));
        }
    });
    
    // 筛选出口记录
    const filteredExportRecords = allExportRecords.filter(record => {
        let match = true;
        
        // 客户筛选
        if (customer && record.customer && !record.customer.includes(customer)) {
            match = false;
        }
        
        // 日期筛选
        if (dateFrom || dateTo) {
            const recordDate = new Date(record[dateType] || '');
            if (dateFrom && recordDate < new Date(dateFrom)) {
                match = false;
            }
            if (dateTo && recordDate > new Date(dateTo)) {
                match = false;
            }
        }
        
        // 状态筛选
        if (statusFilter && match) {
            const recordOrderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
            const isInvoiced = recordOrderNos.some(orderNo => invoicedOrderNos.has(orderNo));
            if (statusFilter === 'invoiced' && !isInvoiced) {
                match = false;
            } else if (statusFilter === 'uninvoiced' && isInvoiced) {
                match = false;
            }
        }
        
        return match;
    });
    
    // 更新表格
    pageController.renderExportTable(filteredExportRecords);
}

// 重置出口记录筛选条件
function resetExportFilters() {
    document.getElementById('exportCustomerSearch').value = '';
    document.getElementById('exportDateType').value = 'exportDate';
    document.getElementById('exportStatusFilter').value = '';
    document.getElementById('exportDateFrom').value = '';
    document.getElementById('exportDateTo').value = '';
    
    // 隐藏搜索建议
    const suggestions = document.getElementById('exportCustomerSuggestions');
    if (suggestions) {
        suggestions.classList.add('hidden');
    }
    
    // 重置分页数据，显示所有出口记录
    const allExportRecords = storage.getExportRecords();
    pageController.renderExportTable(allExportRecords);
}

// 导入客户Excel
function importCustomersExcel() {
    // 直接使用页面中已经存在的文件输入元素
    const fileInput = document.getElementById('import-excel-file');
    if (fileInput) {
        // 触发文件选择对话框
        fileInput.click();
    }
}

// 为订单管理页面的搜索输入框添加事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 设置开票日期默认值为今日
    const today = new Date().toISOString().split('T')[0];
    const invoiceDateInput = document.getElementById('invoiceDate');
    if (invoiceDateInput) {
        invoiceDateInput.value = today;
    }
    
    const orderSearchInput = document.getElementById('orderSearch');
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', function() {
            searchOrdersInTable(this.value);
        });
    }
    
    // 为订单管理页面的状态下拉框添加事件监听器
    const orderStatusSearch = document.getElementById('orderStatusSearch');
    if (orderStatusSearch) {
        orderStatusSearch.addEventListener('change', function() {
            searchOrderRecords();
        });
    }
    
    // 为出口管理页面的搜索输入框添加事件监听器
    const exportSearchInput = document.getElementById('exportSearch');
    if (exportSearchInput) {
        exportSearchInput.addEventListener('input', function() {
            searchExportTable(this.value);
        });
    }
    
    // 初始化出口记录，为没有id的记录添加id
    const exportRecords = storage.getExportRecords();
    let hasMissingId = false;
    
    for (let i = 0; i < exportRecords.length; i++) {
        if (!exportRecords[i].id) {
            exportRecords[i].id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            hasMissingId = true;
        }
    }
    
    if (hasMissingId) {
        storage.exportRecords = exportRecords;
        console.log('已为现有出口记录添加id');
    }
    
    // 初始化发票管理查询条件中的客户和收款单位选项
    pageController.updateInvoiceFilterOptions();
});

// 处理Excel导入
function handleExcelImport(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                // 解析Excel文件
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                // 处理导入的数据
                const importedRecords = jsonData.map((row, index) => {
                    return {
                        id: Date.now().toString() + index,
                        customerId: row['客户ID'] || row['customerId'] || '',
                        customerName: row['客户名称'] || row['customerName'] || '',
                        customerType: row['客户类型'] || row['customerType'] || '',
                        region: row['所在地区'] || row['region'] || '',
                        contactName: row['联系人'] || row['contactName'] || '',
                        phone: row['联系电话'] || row['phone'] || '',
                        email: row['电子邮箱'] || row['email'] || '',
                        address: row['公司地址'] || row['address'] || '',
                        position: row['职位'] || row['position'] || '',
                        website: row['公司网址'] || row['website'] || '',
                        taxId: row['税务登记号'] || row['taxId'] || '',
                        bankInfo: row['银行信息'] || row['bankInfo'] || '',
                        tags: row['标签'] || row['tags'] || '',
                        remark: row['备注'] || row['remark'] || ''
                    };
                });
                
                // 保存到localStorage
                const currentRecords = storage.getCustomerRecords();
                const updatedRecords = [...currentRecords, ...importedRecords];
                localStorage.setItem('customerRecords', JSON.stringify(updatedRecords));
                
                // 直接更新分页数据并重新渲染
                paginations.customer.updateData(updatedRecords);
                pageController.renderCustomerTable();
            } catch (error) {
                console.error('Excel导入失败:', error);
                pageController.showNotification('Excel导入失败', 'error');
            }
        };
        
        reader.readAsArrayBuffer(file);
    }
}

// 搜索付款记录
function searchPaymentRecords() {
    const customer = document.getElementById('paymentCustomerSearch').value;
    const paymentType = document.getElementById('paymentTypeSearch').value;
    const startDate = document.getElementById('paymentStartDate').value;
    const endDate = document.getElementById('paymentEndDate').value;
    
    // 获取所有付款记录
    const allPaymentRecords = storage.getPaymentRecords();
    
    // 筛选付款记录
    const filteredPaymentRecords = allPaymentRecords.filter(record => {
        let match = true;
        
        // 客户筛选
        if (customer && record.customer && record.customer !== customer) {
            match = false;
        }
        
        // 付款类型筛选
        if (paymentType && record.paymentMethod && record.paymentMethod !== paymentType) {
            match = false;
        }
        
        // 日期筛选
        if (startDate || endDate) {
            const recordDate = new Date(record.paymentDate || '');
            if (startDate && recordDate < new Date(startDate)) {
                match = false;
            }
            if (endDate && recordDate > new Date(endDate)) {
                match = false;
            }
        }
        
        return match;
    });
    
    // 更新表格
    paginations.payment.setFilteredData(filteredPaymentRecords);
    pageController.renderPaymentTable();
}

// 重置付款记录筛选条件
function resetPaymentFilters() {
    document.getElementById('paymentCustomerSearch').value = '';
    document.getElementById('paymentTypeSearch').value = '';
    document.getElementById('paymentStartDate').value = '';
    document.getElementById('paymentEndDate').value = '';
    // 清空搜索框
    const searchInput = document.getElementById('paymentSearch');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // 调用handlePaymentSearch方法，实现统一的搜索和筛选功能
    pageController.handlePaymentSearch();
}

// 重置开票记录模态框
function resetInvoiceModal() {
    const modal = document.getElementById('invoiceModal');
    if (modal && modal.initialState) {
        pageController.resetInvoiceModalToInitialState(modal.initialState);
    }
}

// 打开模态框
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        // 针对开票记录模态框的特殊处理
        if (modalId === 'invoiceModal') {
            // 先保存模态框初始状态，再调用initInvoiceModal()
            // 因为initInvoiceModal()会修改开票日期的值
            modal.initialState = pageController.saveInvoiceModalInitialState();
            pageController.initInvoiceModal();
        }
        // 针对新增出口记录模态框的特殊处理
        else if (modalId === 'exportModal') {
            // 1. 出货日期默认值为今日
            const today = new Date().toISOString().split('T')[0];
            const exportDateInput = document.getElementById('exportDate');
            if (exportDateInput) {
                exportDateInput.value = today;
            }
            
            // 2. 订单号下拉框从订单管理表格中提取，过滤掉已出货状态的订单号
            const orderSelect = document.getElementById('exportOrder');
            if (orderSelect) {
                // 清空现有选项
                orderSelect.innerHTML = '';
                
                // 获取所有订单记录
                const orderRecords = storage.getOrderRecords();
                
                // 先按订单号分组，计算每个订单号的总数量
                const orderQuantityByOrderNo = {};
                const orderCustomerByOrderNo = {};
                
                orderRecords.forEach(record => {
                    const orderNo = record.orderNo;
                    const quantity = parseFloat(record.quantity || 0);
                    const customer = record.customer;
                    
                    if (!orderQuantityByOrderNo[orderNo]) {
                        orderQuantityByOrderNo[orderNo] = 0;
                        orderCustomerByOrderNo[orderNo] = customer;
                    }
                    
                    orderQuantityByOrderNo[orderNo] += quantity;
                });
                
                // 获取当前选中的付款类型
                const paymentType = document.getElementById('paymentType').value;
                
                // 添加订单选项（去重）
                orderRecords.forEach(record => {
                    const orderNo = record.orderNo;
                    
                    // 检查是否已添加过该订单号
                    if (orderSelect.querySelector(`option[value="${orderNo}"]`)) {
                        return;
                    }
                    
                    // 只有当付款类型为"预付款"时，才过滤掉已出货状态的订单
                    if (paymentType === '预付款') {
                        if (record.status !== '已出货') {
                            const option = document.createElement('option');
                            option.value = orderNo;
                            option.textContent = orderNo;
                            option.dataset.customer = orderCustomerByOrderNo[orderNo] || '';
                            option.dataset.quantity = orderQuantityByOrderNo[orderNo] || '0';
                            orderSelect.appendChild(option);
                        }
                    } else {
                        // 其他付款类型显示所有订单
                        const option = document.createElement('option');
                        option.value = orderNo;
                        option.textContent = orderNo;
                        option.dataset.customer = orderCustomerByOrderNo[orderNo] || '';
                        option.dataset.quantity = orderQuantityByOrderNo[orderNo] || '0';
                        orderSelect.appendChild(option);
                    }
                });
                
                // 3. 客户和数量根据订单号自动填充
                orderSelect.addEventListener('change', function() {
                    const selectedOptions = Array.from(this.selectedOptions);
                    if (selectedOptions.length > 0) {
                        // 使用第一个选中的订单的客户
                        const customer = selectedOptions[0].dataset.customer;
                        const customerInput = document.getElementById('exportCustomer');
                        if (customerInput) {
                            customerInput.value = customer;
                        }
                        
                        // 汇总所有选中订单的数量（已经是合计值）
                        let totalQuantity = 0;
                        selectedOptions.forEach(option => {
                            totalQuantity += parseFloat(option.dataset.quantity) || 0;
                        });
                        const quantityInput = document.getElementById('exportQuantity');
                        if (quantityInput) {
                            quantityInput.value = totalQuantity.toFixed(2);
                        }
                    } else {
                        const customerInput = document.getElementById('exportCustomer');
                        if (customerInput) {
                            customerInput.value = '';
                        }
                        const quantityInput = document.getElementById('exportQuantity');
                        if (quantityInput) {
                            quantityInput.value = '';
                        }
                    }
                });
            }
            
            // 4. 当鼠标悬停在报关金额输入框时，自动汇总合计选中订单的金额
            const declarationAmountInput = document.getElementById('exportDeclarationAmount');
            if (declarationAmountInput) {
                declarationAmountInput.addEventListener('mouseenter', function() {
                    const orderSelect = document.getElementById('exportOrder');
                    const selectedOptions = Array.from(orderSelect.selectedOptions);
                    if (selectedOptions.length > 0) {
                        // 获取所有选中的订单号
                        const selectedOrderNos = selectedOptions.map(option => option.value);
                        
                        // 汇总这些订单的金额
                        const orderRecords = storage.getOrderRecords();
                        let totalAmount = 0;
                        
                        orderRecords.forEach(record => {
                            if (selectedOrderNos.includes(record.orderNo) && record.amount) {
                                totalAmount += parseFloat(record.amount);
                            }
                        });
                        
                        // 显示提示
                        this.title = `选中订单的总金额：${totalAmount.toFixed(2)}`;
                    }
                });
            }
        } else if (modalId === 'paymentModal') {
            // 1. 付款日期默认值为今日
            const today = new Date().toISOString().split('T')[0];
            const paymentDateInput = document.getElementById('paymentDate');
            if (paymentDateInput) {
                paymentDateInput.value = today;
            }
            
            // 2. 订单号下拉框从订单管理表格中提取，过滤掉已出货状态的订单号
            const orderSelect = document.getElementById('paymentOrderNo');
            if (orderSelect) {
                // 清空现有选项
                orderSelect.innerHTML = '';
                
                // 获取所有订单记录，去重并过滤掉已出货状态
                const orderRecords = storage.getOrderRecords();
                const uniqueOrders = {};
                
                orderRecords.forEach(record => {
                    // 过滤掉已出货状态的订单
                    if (record.status !== '已出货') {
                        uniqueOrders[record.orderNo] = record;
                    }
                });
                
                // 添加订单选项
                Object.values(uniqueOrders).forEach(order => {
                    const option = document.createElement('option');
                    option.value = order.orderNo;
                    option.textContent = order.orderNo;
                    option.dataset.customer = order.customer;
                    orderSelect.appendChild(option);
                });
                
                // 3. 客户根据订单号自动填充
                orderSelect.addEventListener('change', function() {
                    const selectedOptions = Array.from(this.selectedOptions);
                    if (selectedOptions.length > 0) {
                        // 使用第一个选中的订单的客户
                        const customer = selectedOptions[0].dataset.customer;
                        const customerInput = document.getElementById('paymentCustomer');
                        if (customerInput) {
                            customerInput.value = customer;
                        }
                    } else {
                        const customerInput = document.getElementById('paymentCustomer');
                        if (customerInput) {
                            customerInput.value = '';
                        }
                    }
                });
            }
            
            // 初始化订单号选择方式
            function initOrderNoSelection() {
                const paymentType = document.getElementById('paymentType').value;
                const orderNoInputWrapper = document.getElementById('orderNoInputWrapper');
                const orderNoSearchWrapper = document.getElementById('orderNoSearchWrapper');
                const orderNoSelectTip = document.getElementById('orderNoSelectTip');
                
                if (!orderNoInputWrapper || !orderNoSearchWrapper || !orderNoSelectTip) {
                    return;
                }
                
                if (paymentType === '预付款') {
                    orderNoInputWrapper.classList.remove('hidden');
                    orderNoSearchWrapper.classList.add('hidden');
                    orderNoSelectTip.textContent = '(按Ctrl键可多选)';
                } else {
                    orderNoInputWrapper.classList.add('hidden');
                    orderNoSearchWrapper.classList.remove('hidden');
                    orderNoSelectTip.textContent = '(搜索订单号，点击选择)';
                }
            }
            
            // 初始化订单号选择方式
            initOrderNoSelection();
            
            // 添加订单号搜索事件监听器
            const paymentOrderNoSearch = document.getElementById('paymentOrderNoSearch');
            const paymentOrderNoSuggestions = document.getElementById('paymentOrderNoSuggestions');
            
            if (paymentOrderNoSearch && paymentOrderNoSuggestions) {
                // 移除之前可能存在的事件监听器
                paymentOrderNoSearch.removeEventListener('input', handleOrderNoSearch);
                
                // 定义搜索处理函数
                function handleOrderNoSearch() {
                    const searchTerm = this.value.split(',').pop().trim();
                    
                    try {
                        const orderRecords = storage.getOrderRecords();
                        
                        // 获取所有订单记录，去重
                        const uniqueOrders = {};
                        orderRecords.forEach(record => {
                            uniqueOrders[record.orderNo] = record;
                        });
                        
                        // 筛选匹配的订单
                        const filteredOrders = Object.values(uniqueOrders).filter(order => 
                            order.orderNo.toLowerCase().includes(searchTerm.toLowerCase())
                        );
                        
                        // 清空现有建议
                        paymentOrderNoSuggestions.innerHTML = '';
                        
                        if (filteredOrders.length > 0) {
                            // 添加建议项
                            filteredOrders.forEach(order => {
                                const div = document.createElement('div');
                                div.className = 'p-2 hover:bg-gray-100 cursor-pointer';
                                div.dataset.orderNo = order.orderNo;
                                div.dataset.customer = order.customer;
                                div.textContent = order.orderNo;
                                paymentOrderNoSuggestions.appendChild(div);
                            });
                            // 确保建议列表可见
                            paymentOrderNoSuggestions.style.display = 'block';
                            paymentOrderNoSuggestions.classList.remove('hidden');
                        } else {
                            paymentOrderNoSuggestions.classList.add('hidden');
                        }
                    } catch (error) {
                        // 忽略错误，避免影响页面正常运行
                    }
                }
                
                // 添加输入事件监听器
                paymentOrderNoSearch.addEventListener('input', handleOrderNoSearch);
                
                // 添加一个简单的测试，确保事件监听器被正确添加
                console.log('Order number search event listener added');
                
                // 添加焦点事件，确保输入时建议列表可见
                paymentOrderNoSearch.addEventListener('focus', function() {
                    console.log('Search input focused');
                    const searchTerm = this.value.split(',').pop().trim();
                    if (searchTerm) {
                        // 手动触发输入事件，显示建议列表
                        handleOrderNoSearch.call(this);
                    }
                });
                
                // 添加建议项点击事件监听器
                paymentOrderNoSuggestions.removeEventListener('click', handleSuggestionClick);
                
                function handleSuggestionClick(e) {
                    if (e.target.tagName === 'DIV') {
                        const orderNo = e.target.dataset.orderNo;
                        const customer = e.target.dataset.customer;
                        
                        if (orderNo) {
                            const searchInput = document.getElementById('paymentOrderNoSearch');
                            const currentValue = searchInput.value;
                            
                            // 检查当前值是否以逗号结尾
                            const newValue = currentValue ? `${currentValue},${orderNo}` : orderNo;
                            searchInput.value = newValue;
                            
                            // 清空建议列表
                            paymentOrderNoSuggestions.classList.add('hidden');
                            
                            // 更新客户信息
                            const paymentCustomer = document.getElementById('paymentCustomer');
                            if (paymentCustomer && customer) {
                                paymentCustomer.value = customer;
                            }
                            
                            // 当付款类型为尾款时，自动填充收款单位
                            autoFillRecipientForFinalPayment(orderNo);
                        }
                    }
                }
                
                // 当付款类型为尾款时，根据订单号自动填充收款单位
                function autoFillRecipientForFinalPayment(orderNo) {
                    const paymentType = document.getElementById('paymentType').value;
                    if (paymentType === '尾款') {
                        // 从账务管理表格中查找该订单号的预付款记录
                        const paymentRecords = storage.getPaymentRecords();
                        const prepaymentRecord = paymentRecords.find(record => 
                            record.orderNo && record.orderNo.includes(orderNo) && 
                            record.paymentMethod === '预付款'
                        );
                        
                        if (prepaymentRecord && prepaymentRecord.recipient) {
                            // 更新收款单位
                            const recipient = prepaymentRecord.recipient;
                            const recipientSelect = document.getElementById('paymentRecipientSelect');
                            const recipientInput = document.getElementById('paymentRecipientInput');
                            const recipientHidden = document.getElementById('paymentRecipient');
                            
                            // 检查收款单位是否在选项中
                            const optionExists = Array.from(recipientSelect.options).some(option => 
                                option.value === recipient
                            );
                            
                            if (optionExists) {
                                recipientSelect.value = recipient;
                                recipientInput.classList.add('hidden');
                                recipientHidden.value = recipient;
                            } else {
                                recipientSelect.value = 'other';
                                recipientInput.classList.remove('hidden');
                                recipientInput.value = recipient;
                                recipientHidden.value = recipient;
                            }
                        }
                    }
                }
                
                // 为订单号搜索输入框添加input事件监听器，处理手动输入订单号的情况
                paymentOrderNoSearch.addEventListener('input', function() {
                    const orderNos = this.value.split(',').map(no => no.trim()).filter(no => no !== '');
                    if (orderNos.length > 0) {
                        // 处理最后一个订单号
                        const lastOrderNo = orderNos[orderNos.length - 1];
                        autoFillRecipientForFinalPayment(lastOrderNo);
                    }
                });
                
                paymentOrderNoSuggestions.addEventListener('click', handleSuggestionClick);
            }
            
            // 2. 为付款类型选择框添加change事件监听器
            const paymentTypeSelect = document.getElementById('paymentType');
            if (paymentTypeSelect) {
                paymentTypeSelect.addEventListener('change', function() {
                    // 重新初始化订单号列表
                    const orderSelect = document.getElementById('paymentOrderNo');
                    if (orderSelect) {
                        // 清空现有选项
                        orderSelect.innerHTML = '';
                        
                        // 获取所有订单记录，去重
                        const orderRecords = storage.getOrderRecords();
                        const uniqueOrders = {};
                        
                        orderRecords.forEach(record => {
                            // 获取当前选中的付款类型
                            const paymentType = this.value;
                            
                            // 只有当付款类型为"预付款"时，才过滤掉已出货状态的订单
                            if (paymentType === '预付款') {
                                if (record.status !== '已出货') {
                                    uniqueOrders[record.orderNo] = record;
                                }
                            } else {
                                // 其他付款类型显示所有订单
                                uniqueOrders[record.orderNo] = record;
                            }
                        });
                        
                        // 添加订单选项
                        Object.values(uniqueOrders).forEach(order => {
                            const option = document.createElement('option');
                            option.value = order.orderNo;
                            option.textContent = order.orderNo;
                            option.dataset.customer = order.customer;
                            orderSelect.appendChild(option);
                        });
                    }
                    
                    if (this.value === '余款') {
                        // 当选择余款时，汇总预付款金额
                        updatePaymentAmountHint();
                    }
                    
                    // 切换订单号选择方式
                    initOrderNoSelection();
                });
            }
            
            // 3. 为付款金额输入框添加mouseenter事件监听器
            const paymentAmountInput = document.getElementById('paymentAmount');
            if (paymentAmountInput) {
                paymentAmountInput.addEventListener('mouseenter', function() {
                    // 显示预付款汇总金额提示
                    showPaymentAmountHint(this);
                });
            }
        } else if (modalId === 'orderModal') {
            // 1. 订单日期默认值为今日
            const today = new Date().toISOString().split('T')[0];
            const orderDateInput = document.getElementById('orderOrderDate');
            if (orderDateInput) {
                orderDateInput.value = today;
            }
            
            // 2. 交易条款默认值为FOB
            const tradeTermsSelect = document.getElementById('orderTradeTerms');
            if (tradeTermsSelect) {
                tradeTermsSelect.value = 'FOB';
            }
            
            // 3. 货币默认值为EUR
            const currencySelect = document.getElementById('orderCurrency');
            if (currencySelect) {
                currencySelect.value = 'EUR';
            }
            
            // 重置产品行的规格和图号
            const productRows = document.querySelectorAll('#productRowsContainer .product-row');
            productRows.forEach(row => {
                const specInput = row.querySelector('input[name="spec"]');
                const drawingNoInput = row.querySelector('input[name="drawingNo"]');
                if (specInput) specInput.value = '';
                if (drawingNoInput) drawingNoInput.value = '';
            });
        }
    }
}

// 打开新增收汇记录模态框
function openAddReceiptModal() {
    // 获取客户下拉框
    const customerSelect = document.getElementById('addReceiptCustomer');
    if (customerSelect) {
        // 清空现有客户选项
        customerSelect.innerHTML = '<option value="">请选择客户</option>';
        
        // 从订单记录中获取所有唯一客户
        const orderRecords = storage.orderRecords;
        const customers = [...new Set(orderRecords.map(order => order.customer))];
        
        // 添加客户选项
        customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer;
            option.textContent = customer;
            customerSelect.appendChild(option);
        });
    }
    
    // 清空订单号下拉框
    const orderNoSelect = document.getElementById('addReceiptOrderNo');
    if (orderNoSelect) {
        orderNoSelect.innerHTML = '<option value="">请选择订单号</option>';
    }
    
    // 设置收汇日期为今天
    const receiptDate = document.getElementById('addReceiptDate');
    if (receiptDate) {
        receiptDate.value = new Date().toISOString().split('T')[0];
    }
    
    // 清空其他字段
    document.getElementById('addReceiptId').value = '';
    document.getElementById('addReceiptAmountReceived').value = '';
    document.getElementById('addReceiptFee').value = '';
    document.getElementById('addReceiptCurrency').value = 'USD';
    document.getElementById('addReceiptExchangeRate').value = '';
    document.getElementById('addReceiptRate').value = '';
    document.getElementById('addReceiptRemark').value = '';
    
    // 更新收汇金额提示
    const tooltip = document.getElementById('addReceiptAmountTooltip');
    if (tooltip) {
        tooltip.textContent = '请选择订单号查看欠款金额';
    }
    
    // 打开新增收汇记录模态框
    openModal('addReceiptModal');
}

// 全局处理函数：处理订单复选框状态变化（跨页选中）
function handleOrderCheckboxChange(e) {
    if (e.target.classList.contains('order-checkbox')) {
        const orderId = e.target.getAttribute('data-id');
        if (e.target.checked) {
            selectedOrderIds.add(orderId);
        } else {
            selectedOrderIds.delete(orderId);
        }
        updateOrderSelectAllCheckboxState();
        // 更新已勾选订单的金额合计
        updateSelectedOrderAmount();
    }
}

// 初始化订单表格全选功能
function initOrderTableSelectAll() {
    // 移除旧的事件监听器，避免重复绑定
    document.removeEventListener('change', handleOrderCheckboxChange);

    // 重新添加事件监听器（事件委托，动态渲染的行也生效）
    document.addEventListener('change', handleOrderCheckboxChange);

    const selectAllCheckbox = document.getElementById('selectAllOrders');
    if (selectAllCheckbox) {
        // 先移除之前的事件监听器，避免重复绑定
        const newSelectAllCheckbox = selectAllCheckbox.cloneNode(true);
        selectAllCheckbox.parentNode.replaceChild(newSelectAllCheckbox, selectAllCheckbox);

        // 全选/取消全选：作用于当前筛选结果的所有页
        newSelectAllCheckbox.addEventListener('change', function() {
            const filteredIds = paginations.order.filteredData.map(o => o.id);
            if (this.checked) {
                filteredIds.forEach(id => selectedOrderIds.add(id));
            } else {
                filteredIds.forEach(id => selectedOrderIds.delete(id));
            }
            syncOrderCheckboxStates();
            updateSelectedOrderAmount();
        });
    }

    // 同步当前页复选框与全选复选框状态（保留跨页选中）
    syncOrderCheckboxStates();
    // 初始化完成后，更新已勾选订单的金额合计显示
    updateSelectedOrderAmount();
}

// 初始化收汇管理表格全选功能
function initReceiptTableSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllReceipts');
    if (selectAllCheckbox) {
        // 全选/取消全选功能
        selectAllCheckbox.addEventListener('change', function() {
            const receiptCheckboxes = document.querySelectorAll('.receipt-checkbox');
            receiptCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateSelectedReceiptAmount();
        });
    }
    
    // 添加document级别事件监听，确保表格刷新后仍能生效
    document.removeEventListener('change', handleReceiptCheckboxClickGlobal);
    document.addEventListener('change', handleReceiptCheckboxClickGlobal);
}

// 全局收汇复选框点击处理函数
function handleReceiptCheckboxClickGlobal(e) {
    if (e.target && e.target.classList && e.target.classList.contains('receipt-checkbox')) {
        const selectAllCheckbox = document.getElementById('selectAllReceipts');
        if (selectAllCheckbox) {
            const receiptCheckboxes = document.querySelectorAll('.receipt-checkbox');
            const checkedCount = document.querySelectorAll('.receipt-checkbox:checked').length;
            selectAllCheckbox.checked = checkedCount === receiptCheckboxes.length;
        }
        updateSelectedReceiptAmount();
    }
}

// 处理单个收汇复选框点击
function handleReceiptCheckboxClick(e) {
    if (e.target && e.target.classList && e.target.classList.contains('receipt-checkbox')) {
        const selectAllCheckbox = document.getElementById('selectAllReceipts');
        if (selectAllCheckbox) {
            const receiptCheckboxes = document.querySelectorAll('.receipt-checkbox');
            const checkedCount = document.querySelectorAll('.receipt-checkbox:checked').length;
            selectAllCheckbox.checked = checkedCount === receiptCheckboxes.length;
        }
        updateSelectedReceiptAmount();
    }
}

// 计算已勾选收汇记录的金额合计
function calculateSelectedReceiptAmount() {
    const checkedCheckboxes = document.querySelectorAll('.receipt-checkbox:checked');
    let totalAmount = 0;
    
    checkedCheckboxes.forEach(checkbox => {
        const receiptId = checkbox.dataset.id;
        const receipt = storage.receiptRecords.find(r => r.id === receiptId);
        if (receipt) {
            const amount = parseFloat(receipt.amountReceived || 0);
            totalAmount += isNaN(amount) ? 0 : amount;
        }
    });
    
    return totalAmount;
}

// 更新已勾选收汇记录的金额合计显示
function updateSelectedReceiptAmount() {
    const selectedAmount = calculateSelectedReceiptAmount();
    const receiptCountWrapper = document.getElementById('receiptCountWrapper');
    
    console.log('Selected amount:', selectedAmount);
    console.log('receiptCountWrapper:', receiptCountWrapper);
    
    if (receiptCountWrapper) {
        // 移除旧的已勾选金额合计显示
        const oldSelectedInfo = receiptCountWrapper.querySelector('.selected-receipt-amount');
        if (oldSelectedInfo) {
            oldSelectedInfo.remove();
        }
        
        // 如果有已勾选的记录，添加新的显示
        if (selectedAmount > 0) {
            const selectedInfo = document.createElement('span');
            selectedInfo.className = 'selected-receipt-amount';
            selectedInfo.innerHTML = `<span class="text-gray-500 ml-2">|</span> <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full ml-2">已勾选收汇金额: <strong style="color: #059669;">¥${selectedAmount.toFixed(2)}</strong></span>`;
            receiptCountWrapper.appendChild(selectedInfo);
        }
    } else {
        console.log('receiptCountWrapper not found!');
    }
}

// 计算已勾选付款记录的金额合计
function calculateSelectedPaymentAmount() {
    const checkedCheckboxes = document.querySelectorAll('.payment-checkbox:checked');
    let totalAmount = 0;
    
    checkedCheckboxes.forEach(checkbox => {
        const paymentId = checkbox.dataset.id;
        const payment = storage.paymentRecords.find(r => r.id === paymentId);
        if (payment) {
            const amount = parseFloat(payment.amount || 0);
            totalAmount += isNaN(amount) ? 0 : amount;
        }
    });
    
    return totalAmount;
}

// 更新已勾选付款记录的金额合计显示
function updateSelectedPaymentAmount() {
    const selectedAmount = calculateSelectedPaymentAmount();
    const paymentCountWrapper = document.getElementById('paymentCountWrapper');
    
    if (paymentCountWrapper) {
        // 移除旧的已勾选金额合计显示
        const oldSelectedInfo = paymentCountWrapper.querySelector('.selected-payment-amount');
        if (oldSelectedInfo) {
            oldSelectedInfo.remove();
        }
        
        // 如果有已勾选的记录，添加新的显示
        if (selectedAmount > 0) {
            const selectedInfo = document.createElement('span');
            selectedInfo.className = 'selected-payment-amount bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full ml-2';
            selectedInfo.innerHTML = `已勾选付款金额: <strong>${selectedAmount.toFixed(2)}</strong>`;
            paymentCountWrapper.appendChild(selectedInfo);
        }
    }
}

// 全局付款复选框点击处理函数
function handlePaymentCheckboxClickGlobal(e) {
    if (e.target && e.target.classList && e.target.classList.contains('payment-checkbox')) {
        const selectAllCheckbox = document.getElementById('selectAllPayments');
        if (selectAllCheckbox) {
            const paymentCheckboxes = document.querySelectorAll('.payment-checkbox');
            const checkedCount = document.querySelectorAll('.payment-checkbox:checked').length;
            selectAllCheckbox.checked = checkedCount === paymentCheckboxes.length;
        }
        updateSelectedPaymentAmount();
    }
}

// 初始化账务管理表格全选功能
function initPaymentTableSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllPayments');
    if (selectAllCheckbox) {
        // 移除之前的事件监听器，避免重复绑定
        const newSelectAllCheckbox = selectAllCheckbox.cloneNode(true);
        selectAllCheckbox.parentNode.replaceChild(newSelectAllCheckbox, selectAllCheckbox);
        
        // 全选/取消全选功能
        newSelectAllCheckbox.addEventListener('change', function() {
            const paymentCheckboxes = document.querySelectorAll('.payment-checkbox');
            paymentCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateSelectedPaymentAmount();
        });
        
        // 移除之前的事件监听器，避免重复绑定
        document.removeEventListener('change', handlePaymentCheckboxClickGlobal);
        document.addEventListener('change', handlePaymentCheckboxClickGlobal);
    }
}

// 初始化出口管理表格全选功能
function initExportTableSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllExports');
    if (selectAllCheckbox) {
        // 移除之前的事件监听器，避免重复绑定
        const newSelectAllCheckbox = selectAllCheckbox.cloneNode(true);
        selectAllCheckbox.parentNode.replaceChild(newSelectAllCheckbox, selectAllCheckbox);
        
        // 全选/取消全选功能
        newSelectAllCheckbox.addEventListener('change', function() {
            const exportCheckboxes = document.querySelectorAll('.export-checkbox');
            exportCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });
        
        // 单个复选框状态改变时，更新全选复选框状态
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('export-checkbox')) {
                const exportCheckboxes = document.querySelectorAll('.export-checkbox');
                const checkedCount = document.querySelectorAll('.export-checkbox:checked').length;
                newSelectAllCheckbox.checked = checkedCount === exportCheckboxes.length;
            }
        });
    }
}

// 计算已勾选发票记录的开票金额合计
function calculateSelectedInvoiceAmount() {
    const checkedCheckboxes = document.querySelectorAll('.invoice-checkbox:checked');
    let totalAmount = 0;
    
    checkedCheckboxes.forEach(checkbox => {
        const invoiceId = checkbox.dataset.id;
        const invoice = storage.invoiceRecords.find(r => r.id === invoiceId);
        if (invoice) {
            const amount = parseFloat(invoice.amount || 0);
            totalAmount += isNaN(amount) ? 0 : amount;
        }
    });
    
    return totalAmount;
}

// 更新已勾选发票记录的开票金额合计显示
function updateSelectedInvoiceAmount() {
    const selectedAmount = calculateSelectedInvoiceAmount();
    const invoiceCountWrapper = document.getElementById('invoiceCountWrapper');
    
    if (invoiceCountWrapper) {
        // 移除旧的已勾选金额合计显示
        const oldSelectedInfo = invoiceCountWrapper.querySelector('.selected-invoice-amount');
        if (oldSelectedInfo) {
            oldSelectedInfo.remove();
        }
        
        // 如果有已勾选的记录，添加新的显示
        if (selectedAmount > 0) {
            const selectedInfo = document.createElement('span');
            selectedInfo.className = 'selected-invoice-amount bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full ml-2';
            selectedInfo.innerHTML = `已勾选开票金额: <strong>${selectedAmount.toFixed(2)}</strong>`;
            invoiceCountWrapper.appendChild(selectedInfo);
        }
    }
}

// 初始化发票管理表格全选功能
function initInvoiceTableSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllInvoices');
    if (selectAllCheckbox) {
        // 移除之前的事件监听器，避免重复绑定
        const newSelectAllCheckbox = selectAllCheckbox.cloneNode(true);
        selectAllCheckbox.parentNode.replaceChild(newSelectAllCheckbox, selectAllCheckbox);
        
        // 全选/取消全选功能
        newSelectAllCheckbox.addEventListener('change', function() {
            const invoiceCheckboxes = document.querySelectorAll('.invoice-checkbox');
            invoiceCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
            updateSelectedInvoiceAmount();
        });
        
        // 移除之前的事件监听器，避免重复绑定
        document.removeEventListener('change', handleInvoiceCheckboxClickGlobal);
        document.addEventListener('change', handleInvoiceCheckboxClickGlobal);
    }
}

// 全局发票复选框点击处理函数
function handleInvoiceCheckboxClickGlobal(e) {
    if (e.target && e.target.classList && e.target.classList.contains('invoice-checkbox')) {
        const selectAllCheckbox = document.getElementById('selectAllInvoices');
        if (selectAllCheckbox) {
            const invoiceCheckboxes = document.querySelectorAll('.invoice-checkbox');
            const checkedCount = document.querySelectorAll('.invoice-checkbox:checked').length;
            selectAllCheckbox.checked = checkedCount === invoiceCheckboxes.length;
        }
        updateSelectedInvoiceAmount();
    }
}

// 打开未开票出口记录选择模态框
function openUninvoicedExportModal() {
    renderUninvoicedExportTable();
    openModal('uninvoicedExportModal');
}

// 渲染未开票出口记录表格
function renderUninvoicedExportTable() {
    const tableBody = document.getElementById('uninvoicedExportTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    // 获取所有出口记录
    const exportRecords = storage.getExportRecords();
    const invoiceRecords = storage.getInvoiceRecords();
    
    // 从发票记录中提取所有订单号
    const invoiceOrderNos = new Set();
    invoiceRecords.forEach(invoice => {
        if (invoice.orderNo) {
            const orderNos = invoice.orderNo.split(',').map(no => no.trim()).filter(Boolean);
            orderNos.forEach(orderNo => invoiceOrderNos.add(orderNo));
        }
    });
    
    // 筛选未开票的出口记录
    const uninvoicedRecords = exportRecords.filter(record => {
        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
        return !orderNos.some(orderNo => invoiceOrderNos.has(orderNo));
    });
    
    // 按出货日期倒序排序
    uninvoicedRecords.sort((a, b) => {
        if (!a.exportDate && !b.exportDate) return 0;
        if (!a.exportDate) return 1;
        if (!b.exportDate) return -1;
        return new Date(b.exportDate) - new Date(a.exportDate);
    });
    
    if (uninvoicedRecords.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-gray-500 py-4">暂未找到未开票的出口记录</td></tr>';
        return;
    }
    
    // 渲染表格
    uninvoicedRecords.forEach((record, index) => {
        const row = document.createElement('tr');
        row.className = 'cursor-pointer hover:bg-gray-50';
        row.onclick = (e) => {
            if (!e.target.classList.contains('uninvoiced-export-radio')) {
                selectUninvoicedExport(record);
            }
        };
        row.innerHTML = `
            <td class="text-center">
                <input type="radio" name="uninvoicedExportSelect" value="${index}" class="uninvoiced-export-radio" style="cursor: pointer;">
            </td>
            <td>${record.customer || ''}</td>
            <td>${record.orderNo || ''}</td>
            <td>${record.shippingNo || ''}</td>
            <td>${record.exportDate || ''}</td>
            <td>${record.quantity ? parseFloat(record.quantity).toFixed(2) : ''}</td>
        `;
        const radioBtn = row.querySelector('.uninvoiced-export-radio');
        radioBtn.addEventListener('click', () => selectUninvoicedExport(record));
        tableBody.appendChild(row);
    });
}

// 选择未开票出口记录并填充表单
function selectUninvoicedExport(record) {
    // 填充客户
    const customerInput = document.getElementById('invoiceCustomer');
    if (customerInput) {
        customerInput.value = record.customer || '';
    }
    
    // 填充订单号
    const orderNoInput = document.getElementById('invoiceOrderNo');
    if (orderNoInput) {
        orderNoInput.value = record.orderNo || '';
    }
    
    // 填充运编号
    const shipmentNoInput = document.getElementById('invoiceShipmentNo');
    if (shipmentNoInput) {
        shipmentNoInput.value = record.shippingNo || '';
    }
    
    // 计算收汇总额
    updateInvoiceReceiptTotal(record.orderNo);
    
    // 更新付款单位下拉框，添加客户名称和默认公司选项
    const payerSelect = document.getElementById('invoicePayerSelect');
    const payerHidden = document.getElementById('invoicePayer');
    if (payerSelect && payerHidden && record.customer) {
        // 保存原有选项（除了第一个"请选择"）
        const existingOptions = Array.from(payerSelect.options).slice(1);
        
        // 清空并重建选项
        payerSelect.innerHTML = '';
        
        // 添加第一个选项：请选择
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '请选择付款单位';
        payerSelect.appendChild(emptyOption);
        
        // 添加客户名称选项
        const customerOption = document.createElement('option');
        customerOption.value = record.customer;
        customerOption.textContent = record.customer;
        payerSelect.appendChild(customerOption);
        
        // 添加默认公司选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '无锡市天梁对外贸易有限公司';
        defaultOption.textContent = '无锡市天梁对外贸易有限公司';
        payerSelect.appendChild(defaultOption);
        
        // 添加原有其他选项（排除重复的无锡市天梁对外贸易有限公司）
        existingOptions.forEach(option => {
            if (option.value !== '无锡市天梁对外贸易有限公司') {
                const newOption = document.createElement('option');
                newOption.value = option.value;
                newOption.textContent = option.textContent;
                payerSelect.appendChild(newOption);
            }
        });
        
        // 默认选择无锡市天梁对外贸易有限公司
        payerSelect.value = '无锡市天梁对外贸易有限公司';
        // 同步到隐藏字段
        payerHidden.value = '无锡市天梁对外贸易有限公司';
    }
    
    // 关闭选择模态框
    closeModal('uninvoicedExportModal');
}

// 根据订单货币类型更新付款单位
function updatePayerBasedOnCurrency(orderNo, customer) {
    console.log('=== updatePayerBasedOnCurrency 开始 ===');
    console.log('输入参数 orderNo:', orderNo);
    console.log('输入参数 customer:', customer);
    
    const payerInput = document.getElementById('invoicePayer');
    console.log('payerInput 元素:', payerInput);
    
    if (!payerInput) {
        console.log('❌ payerInput 元素不存在');
        return;
    }
    
    if (!orderNo) {
        console.log('⚠️ orderNo 为空，设置为默认付款单位');
        payerInput.value = '无锡市天梁对外贸易有限公司';
        return;
    }
    
    const orderRecords = storage.getOrderRecords();
    console.log('获取到的订单记录数量:', orderRecords.length);
    
    const orderNos = orderNo.split(',').map(no => no.trim()).filter(Boolean);
    console.log('解析后的订单号列表:', orderNos);
    
    // 查找匹配的订单记录
    let isCNY = false;
    let foundOrder = null;
    for (const oNo of orderNos) {
        console.log('正在查找订单号:', oNo);
        const order = orderRecords.find(r => {
            console.log('对比订单:', r.orderNo, '包含？', oNo);
            return r.orderNo && r.orderNo.includes(oNo);
        });
        if (order) {
            foundOrder = order;
            console.log('✅ 找到匹配的订单:', order);
            if (order.currency) {
                console.log('订单货币类型:', order.currency);
                if (order.currency === 'CNY') {
                    isCNY = true;
                    console.log('🎯 确定是CNY货币');
                }
            } else {
                console.log('⚠️ 订单没有currency字段');
            }
            break;
        }
    }
    
    if (!foundOrder) {
        console.log('❌ 未找到匹配的订单记录，使用默认付款单位');
    }
    
    console.log('isCNY 结果:', isCNY);
    
    if (isCNY) {
        console.log('✅ 设置付款单位为客户名称:', customer);
        payerInput.value = customer || '';
    } else {
        console.log('❌ 设置付款单位为默认值: 无锡市天梁对外贸易有限公司');
        payerInput.value = '无锡市天梁对外贸易有限公司';
    }
    console.log('=== updatePayerBasedOnCurrency 结束 ===');
}

// 根据订单号更新收汇总额
function updateInvoiceReceiptTotal(orderNo) {
    if (!orderNo) return;
    
    const receiptRecords = storage.getReceiptRecords();
    const orderNos = orderNo.split(',').map(no => no.trim()).filter(Boolean);
    
    let total = 0;
    receiptRecords.forEach(receipt => {
        const receiptOrderNos = (receipt.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
        const hasMatch = receiptOrderNos.some(rOrderNo => 
            orderNos.some(oOrderNo => 
                rOrderNo.includes(oOrderNo) || oOrderNo.includes(rOrderNo)
            )
        );
        if (hasMatch) {
            total += parseFloat(receipt.amountReceived || 0);
        }
    });
    
    const receiptTotalInput = document.getElementById('invoiceReceiptTotal');
    if (receiptTotalInput) {
        receiptTotalInput.value = total.toFixed(2);
    }
}

// 页面加载完成后初始化功能

window.addEventListener('load', function() {
    // 初始化存储结构
    storage.init();
    // 初始化客户信息页面国家筛选下拉框（必须在storage.init之后）
    updateCountryFilterOptions();
    // 初始化导航标签
    initNavigationTabs();
    initOrderTableSelectAll();
    initReceiptTableSelectAll();
    initCustomerTagFilter();
    initCustomerSearch();
    // 初始化收汇管理客户下拉框选项
    updateReceiptCustomerOptions();
    // 初始化时检查并更新订单状态
    pageController.updateOrderStatusBasedOnExport();
    // 初始化时渲染数据
    pageController.renderOrderTable();
    pageController.renderCustomerTable();
    pageController.renderExportTable();
    // 初始化出口管理表格全选功能
    initExportTableSelectAll();
});

// 复制到剪贴板函数
function copyToClipboard(text, successMessage) {
    navigator.clipboard.writeText(text)
        .then(() => {
            // 显示成功提示
            const notification = document.createElement('div');
            notification.className = 'fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-5000';
            notification.textContent = successMessage;
            document.body.appendChild(notification);
            
            // 3秒后移除提示
            setTimeout(() => {
                notification.remove();
            }, 3000);
        })
        .catch(err => {
            console.error('复制失败:', err);
        });
}

// 双击跟进单号切换背景色
function toggleFollowupHighlight(element) {
    const followupNo = element.textContent.trim();
    // 获取已高亮的跟进单号列表
    const highlightedList = getHighlightedFollowupNos();
    
    if (element.classList.contains('followup-highlight-active')) {
        element.classList.remove('followup-highlight-active');
        // 从列表中移除
        const index = highlightedList.indexOf(followupNo);
        if (index > -1) {
            highlightedList.splice(index, 1);
        }
    } else {
        element.classList.add('followup-highlight-active');
        // 添加到列表中
        if (!highlightedList.includes(followupNo)) {
            highlightedList.push(followupNo);
        }
    }
    
    // 保存到localStorage
    localStorage.setItem('highlightedFollowupNos', JSON.stringify(highlightedList));
}

// 获取已高亮的跟进单号列表
function getHighlightedFollowupNos() {
    const stored = localStorage.getItem('highlightedFollowupNos');
    return stored ? JSON.parse(stored) : [];
}

// 关闭模态框
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// 收汇记录筛选
function searchReceiptRecords() {
    // 获取筛选条件
    const globalSearchInput = document.getElementById('receiptGlobalSearch').value;
    const customer = document.getElementById('receiptCustomerSearch').value;
    const unpaidFilter = document.getElementById('receiptUnpaidFilter').value;
    const status = document.getElementById('receiptStatusFilter').value;
    const dateFrom = document.getElementById('receiptDateFrom').value;
    const dateTo = document.getElementById('receiptDateTo').value;
    
    // 支持多词搜索，词与词之间用英文逗号分隔
    const globalSearchTerms = globalSearchInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    
    // 获取所有收汇记录
    const allRecords = storage.getReceiptRecords();
    
    // 获取账务管理中的所有订单号
    const paymentRecords = storage.getPaymentRecords();
    const paymentOrderNos = new Set();
    paymentRecords.forEach(record => {
        if (record.orderNo) {
            const orderNos = record.orderNo.split(',').map(no => no.trim()).filter(Boolean);
            orderNos.forEach(no => paymentOrderNos.add(no));
        }
    });
    
    // 应用筛选条件
    const filteredRecords = allRecords.filter(record => {
        // 全局搜索筛选
        if (globalSearchTerms.length > 0) {
            const hasMatch = globalSearchTerms.some(term => {
                const recordValues = Object.values(record);
                return recordValues.some(value => {
                    if (value === null || value === undefined) return false;
                    return value.toString().toLowerCase().includes(term);
                });
            });
            if (!hasMatch) return false;
        }
        
        // 客户筛选
        if (customer && record.customer !== customer) {
            return false;
        }
        
        // 人民币未支付筛选
        if (unpaidFilter) {
            const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
            const hasUnpaidOrder = orderNos.some(no => !paymentOrderNos.has(no));
            
            if (unpaidFilter === 'yes' && !hasUnpaidOrder) {
                return false;
            }
            if (unpaidFilter === 'no' && hasUnpaidOrder) {
                return false;
            }
        }
        
        // 状态筛选 - 与表格渲染逻辑一致，根据订单号的合计收汇比例计算
        if (status) {
            // 计算每个订单号的合计收汇比例（与表格渲染一致）
            const receiptByOrderNo = {};
            const orderTotalRates = {};
            
            allRecords.forEach(r => {
                const orderNo = r.orderNo;
                if (!receiptByOrderNo[orderNo]) {
                    receiptByOrderNo[orderNo] = [];
                }
                receiptByOrderNo[orderNo].push(r);
            });
            
            Object.keys(receiptByOrderNo).forEach(orderNo => {
                const receipts = receiptByOrderNo[orderNo];
                const totalRate = receipts.reduce((sum, receipt) => {
                    const rate = parseFloat(receipt.rate) || 0;
                    return sum + rate;
                }, 0);
                orderTotalRates[orderNo] = totalRate;
            });
            
            // 获取记录的显示状态（与表格中显示的状态一致）
            const orderNo = record.orderNo;
            const totalRate = orderTotalRates[orderNo] || 0;
            let recordDisplayStatus = '';
            
            if (totalRate > 0 && totalRate < 100) {
                recordDisplayStatus = '部分收汇';
            } else if (totalRate >= 100) {
                recordDisplayStatus = '收汇完毕';
            } else {
                const statusMap = {
                    'pending': '待处理',
                    'completed': '已完成',
                    'failed': '失败',
                    '': '未知',
                    'receipt_completed': '收汇完毕'
                };
                recordDisplayStatus = statusMap[record.status] || '未知';
            }
            
            if (recordDisplayStatus !== status) {
                return false;
            }
        }
        
        // 日期筛选
        if (dateFrom) {
            const recordDate = new Date(record.receiptDate);
            const fromDate = new Date(dateFrom);
            if (recordDate < fromDate) {
                return false;
            }
        }
        
        if (dateTo) {
            const recordDate = new Date(record.receiptDate);
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // 设置为当天结束时间
            if (recordDate > toDate) {
                return false;
            }
        }
        
        return true;
    });
    
    // 更新表格
    pageController.renderReceiptTable(filteredRecords);
}

// 更新收汇管理客户下拉框选项
function updateReceiptCustomerOptions() {
    const receiptCustomerSearch = document.getElementById('receiptCustomerSearch');
    if (!receiptCustomerSearch) return;
    
    // 获取所有收汇记录
    const allRecords = storage.getReceiptRecords();
    
    // 提取所有唯一客户
    const customers = [...new Set(allRecords.map(record => record.customer).filter(Boolean))];
    
    // 清空现有选项，保留第一个"所有客户"选项
    receiptCustomerSearch.innerHTML = '<option value="">所有客户</option>';
    
    // 添加新的客户选项
    customers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer;
        option.textContent = customer;
        receiptCustomerSearch.appendChild(option);
    });
}

// 重置收汇记录筛选条件
function resetReceiptFilters() {
    // 清空筛选条件
    document.getElementById('receiptGlobalSearch').value = '';
    document.getElementById('receiptCustomerSearch').value = '';
    document.getElementById('receiptDateFrom').value = '';
    document.getElementById('receiptDateTo').value = '';
    
    // 重置分页数据，确保获取全部数据
    const allRecords = storage.getReceiptRecords();
    paginations.receipt.setData(allRecords);
    
    // 重新渲染表格
    pageController.renderReceiptTable();
}

// 编辑订单
function editOrder(id) {
    const order = storage.getOrderRecords().find(record => record.id === id);
    if (order) {
        // 填充表单数据
        document.getElementById('editOrderId').value = order.id;
        
        // 处理订单日期，确保正确格式
        let orderDateValue = '';
        if (order.orderDate) {
            const formattedDate = formatDate(order.orderDate);
            const dateObj = new Date(formattedDate);
            if (!isNaN(dateObj.getTime())) {
                orderDateValue = dateObj.toISOString().split('T')[0];
            }
        }
        document.getElementById('editOrderOrderDate').value = orderDateValue;
        
        document.getElementById('editOrderCustomer').value = order.customer || '';
        document.getElementById('editOrderNo').value = order.orderNo || '';
        
        // 处理交货日期，确保正确格式
        let deliveryDateValue = '';
        if (order.deliveryDate) {
            const formattedDate = formatDate(order.deliveryDate);
            const dateObj = new Date(formattedDate);
            if (!isNaN(dateObj.getTime())) {
                deliveryDateValue = dateObj.toISOString().split('T')[0];
            }
        }
        document.getElementById('editOrderDeliveryDate').value = deliveryDateValue;
        document.getElementById('editOrderTradeTerms').value = order.tradeTerms || '';
        document.getElementById('editOrderPaymentMethod').value = order.paymentMethod || '';
        document.getElementById('editOrderTransportMethod').value = order.transportMethod || '';
        document.getElementById('editOrderCurrency').value = order.currency || '';
        document.getElementById('editOrderPacking').value = order.packing || '';
        document.getElementById('editOrderRemark').value = order.remark || '';
        
        // 填充第一条产品行数据
        const firstProductRow = document.querySelector('#editProductRowsContainer .product-row');
        if (firstProductRow) {
            const productNameInput = firstProductRow.querySelector('.product-name');
            const productSpecInput = firstProductRow.querySelector('.product-spec');
            const productDrawingNoInput = firstProductRow.querySelector('.product-drawing-no');
            const productPlatingSelect = firstProductRow.querySelector('.product-plating');
            const productLogoSelect = firstProductRow.querySelector('.product-logo');
            const productUnitSelect = firstProductRow.querySelector('.product-unit');
            const productQuantityInput = firstProductRow.querySelector('.product-quantity');
            const productUnitPriceInput = firstProductRow.querySelector('.product-unit-price');
            const productAmountInput = firstProductRow.querySelector('.product-amount');
            
            if (productNameInput) productNameInput.value = order.productName || '';
            if (productSpecInput) productSpecInput.value = order.spec || '';
            if (productDrawingNoInput) productDrawingNoInput.value = order.drawingNo || '';
            if (productPlatingSelect) productPlatingSelect.value = order.plating || '是';
            if (productLogoSelect) productLogoSelect.value = order.logo || 'LONGLI';
            if (productUnitSelect) productUnitSelect.value = order.unit || '';
            if (productQuantityInput) productQuantityInput.value = order.quantity || '';
            if (productUnitPriceInput) productUnitPriceInput.value = parseFloat(order.unitPrice || 0).toFixed(2);
            if (productAmountInput) productAmountInput.value = parseFloat(order.amount || 0).toFixed(2);
        }
        
        // 更新总金额
        const totalAmount = parseFloat(order.amount || 0);
        document.getElementById('editTotalAmount').textContent = `¥${totalAmount.toFixed(2)}`;
        
        // 打开编辑模态框
        openModal('editOrderModal');
    }
}

// 删除订单
function deleteOrder(id) {
    if (confirm('确定要删除这条订单记录吗？')) {
        const success = storage.deleteOrderRecord(id);
        if (success) {
            pageController.showNotification('订单记录删除成功', 'success');
            pageController.renderOrderTable();
        } else {
            pageController.showNotification('订单记录不存在', 'error');
        }
    }
}

// 切换订单状态
function toggleOrderStatus(id) {
    const order = storage.getOrderRecords().find(record => record.id === id);
    if (order) {
        let newStatus;
        switch (order.status) {
            case '待生产':
                newStatus = '生产中';
                break;
            case '生产中':
                newStatus = '已出货';
                break;
            case '已出货':
                newStatus = '待生产';
                break;
            default:
                newStatus = '待生产';
        }
        
        const success = storage.updateOrderRecord(id, { status: newStatus });
        if (success) {
            // 更新分页缓存中的数据，确保渲染时使用最新数据
            const latestRecords = storage.getOrderRecords();
            paginations.order.updateData(latestRecords);
            
            // 直接更新当前行的状态显示，而不是重新渲染整个表格
            const statusElements = document.querySelectorAll('.status-badge');
            statusElements.forEach(element => {
                if (element.onclick && element.onclick.toString().includes(`toggleOrderStatus('${id}')`)) {
                    // 更新状态文本
                    element.textContent = newStatus;
                    // 更新状态样式
                    element.className = 'status-badge ' + (newStatus === '待生产' ? 'status-pending' : newStatus === '生产中' ? 'status-processing' : newStatus === '已出货' ? 'status-completed' : '');
                }
            });
        }
    }
}

// 编辑收汇记录
function editReceipt(id) {
    const receipt = storage.getReceiptRecords().find(record => record.id === id);
    if (receipt) {
        // 设置模态框标题为编辑收汇记录
        document.getElementById('receiptModalTitle').textContent = '编辑收汇记录';
        
        // 填充表单数据
        document.getElementById('receiptId').value = receipt.id;
        document.getElementById('receiptCustomer').value = receipt.customer || '';
        document.getElementById('receiptOrderNo').value = receipt.orderNo || '';
        document.getElementById('receiptDate').value = receipt.receiptDate ? receipt.receiptDate : '';
        document.getElementById('receiptAmountReceived').value = receipt.amountReceived || '';
        document.getElementById('receiptFee').value = receipt.fee || '';
        document.getElementById('receiptCurrency').value = receipt.currency || 'USD';
        document.getElementById('receiptExchangeRate').value = receipt.exchangeRate || '';
        document.getElementById('receiptRemark').value = receipt.remark || '';
        
        // 计算并填充比例
        calculateReceiptRate();
        
        // 打开编辑模态框
        openModal('receiptModal');
    }
}

// 删除收汇记录
function deleteReceipt(id) {
    if (confirm('确定要删除这条收汇记录吗？')) {
        const records = storage.receiptRecords;
        const newRecords = records.filter(record => record.id !== id);
        if (newRecords.length < records.length) {
            storage.receiptRecords = newRecords;
            pageController.showNotification('收汇记录删除成功', 'success');
            pageController.renderReceiptTable();
            pageController.updateReports();
            // 更新客户下拉框选项
            updateReceiptCustomerOptions();
        } else {
            pageController.showNotification('收汇记录不存在', 'error');
        }
    }
}

// 导入收汇Excel
function importReceiptExcel() {
    // 创建文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';

    // 立即触发文件选择对话框，不等待事件处理函数设置完成
    fileInput.click();

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 检查文件类型
        const fileType = file.name.split('.').pop().toLowerCase();
        const validTypes = ['xlsx', 'xls', 'csv'];
        if (!validTypes.includes(fileType)) {
            pageController.showNotification('不支持的文件类型，请选择.xlsx、.xls或.csv文件', 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                let workbook;

                // 根据文件类型选择不同的读取方式
                if (fileType === 'csv') {
                    // 处理CSV文件
                    const text = event.target.result;
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    // 处理Excel文件
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' });
                }

                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('无效的Excel文件，无法读取工作表');
                }

                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    throw new Error('无法读取工作表数据');
                }

                // 将工作表转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // 处理导入的数据
                const importedRecords = jsonData.map((row, index) => {
                    return {
                        id: Date.now().toString() + index,
                        status: row['状态'] || row['status'] || 'completed',
                        customer: row['客户'] || row['customer'] || '',
                        orderNo: row['订单号'] || row['orderNo'] || '',
                        receiptDate: row['收汇日期'] || row['receiptDate'] || '',
                        amountReceived: row['收汇金额'] || row['amountReceived'] || '',
                        fee: row['手续费'] || row['fee'] || '',
                        currency: row['货币'] || row['currency'] || 'USD',
                        exchangeRate: row['汇率'] || row['exchangeRate'] || '',
                        rate: row['比例'] || row['rate'] || '',
                        remark: row['备注'] || row['remark'] || ''
                    };
                });

                // 保存到localStorage
                const currentRecords = storage.getReceiptRecords();
                const updatedRecords = [...currentRecords, ...importedRecords];
                localStorage.setItem('receiptRecords', JSON.stringify(updatedRecords));

                // 直接更新分页数据并重新渲染收汇表格
                paginations.receipt.updateData(updatedRecords);
                pageController.renderReceiptTable();
                pageController.updateReports();
                // 更新客户下拉框选项
                updateReceiptCustomerOptions();

                // 显示成功提示
                pageController.showNotification('收汇记录导入成功！导入了 ' + importedRecords.length + ' 条记录', 'success');
            } catch (error) {
                console.error('Excel解析失败:', error);
                pageController.showNotification('Excel解析失败，请检查文件格式！错误信息：' + error.message, 'error');
            }
        };

        reader.onerror = (error) => {
            console.error('文件读取失败:', error);
            pageController.showNotification('文件读取失败，请重试！', 'error');
        };

        reader.readAsArrayBuffer(file);
    };
}

// 导出收汇Excel
function exportReceiptExcel() {
    try {
        // 获取所有收汇记录
        const receiptRecords = storage.getReceiptRecords();

        // 准备导出数据，只包含需要的字段
        const exportData = receiptRecords.map(record => ({
            '状态': record.status || '',
            '客户': record.customer || '',
            '订单号': record.orderNo || '',
            '收汇日期': record.receiptDate || '',
            '收汇金额': record.amountReceived || '',
            '手续费': record.fee || '',
            '货币': record.currency || '',
            '汇率': record.exchangeRate || '',
            '比例': record.rate || '',
            '备注': record.remark || ''
        }));

        // 创建工作表和工作簿
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '收汇记录');

        // 导出Excel文件
        const fileName = `收汇记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        // 显示成功提示
        pageController.showNotification('收汇记录导出成功！', 'success');
    } catch (error) {
        console.error('Excel导出失败:', error);
        pageController.showNotification('Excel导出失败，请重试！错误信息：' + error.message, 'error');
    }
}

// 导入订单Excel
function importOrderExcel() {
    // 创建文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 检查文件类型
        const fileType = file.name.split('.').pop().toLowerCase();
        const validTypes = ['xlsx', 'xls', 'csv'];
        if (!validTypes.includes(fileType)) {
            pageController.showNotification('不支持的文件类型，请选择.xlsx、.xls或.csv文件', 'error');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                let workbook;
                
                // 根据文件类型选择不同的读取方式
                if (fileType === 'csv') {
                    // 处理CSV文件
                    const text = event.target.result;
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    // 处理Excel文件
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' }); // 移除cellDates选项，返回原始Excel日期数值
                }
                
                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('无效的Excel文件，无法读取工作表');
                }
                
                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    throw new Error('无法读取工作表数据');
                }
                
                // 将工作表转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1, // 先获取表头行
                    range: 1   // 从第2行开始读取数据
                });
                
                // 检查是否有数据
                if (jsonData.length === 0 || !jsonData[0]) {
                    throw new Error('Excel文件中没有数据');
                }
                
                // 处理导入的数据
                const importedRecords = [];
                
                // 遍历数据行
                jsonData.forEach((row, index) => {
                    // 跳过空行
                    if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) {
                        return;
                    }
                    
                    // 处理行数据，确保所有必要字段都有值
                    // 按照EXCEL表头顺序：状态,订单日期,客户,订单号,交货日期,交易条款,付款方式,运输方式,产品名称,规格,图号,电镀,LOGO,单位,单价,数量,金额,货币,包装,备注
                    const record = {
                        id: Date.now().toString() + index,
                        status: row[0] || '',
                        orderDate: row[1] || '',
                        customer: row[2] || '',
                        orderNo: row[3] || '',
                        deliveryDate: row[4] || '',
                        tradeTerms: row[5] || '',
                        paymentMethod: row[6] || '',
                        transportMethod: row[7] || '',
                        productName: row[8] || '',
                        spec: row[9] || '',
                        drawingNo: row[10] || '',
                        plating: row[11] || '',
                        logo: row[12] || '',
                        unit: row[13] || '',
                        unitPrice: row[14] || '',
                        quantity: row[15] || '',
                        amount: row[16] || '',
                        currency: row[17] || '',
                        packing: row[18] || '',
                        remark: row[19] || ''
                    };
                    
                    importedRecords.push(record);
                });
                
                // 检查是否有有效的记录
                if (importedRecords.length === 0) {
                    throw new Error('没有有效的订单记录可导入');
                }
                
                // 保存到localStorage
                const currentRecords = storage.getOrderRecords();
                const updatedRecords = [...currentRecords, ...importedRecords];
                storage.orderRecords = updatedRecords;

                
                // 更新表格
                pageController.renderOrderTable();
                
                // 显示成功提示
                pageController.showNotification('订单导入成功！导入了 ' + importedRecords.length + ' 条记录', 'success');
            } catch (error) {
                console.error('Excel解析失败:', error);
                let errorMsg = 'Excel解析失败，请检查文件格式！';
                errorMsg += ' 错误信息：' + error.message;
                pageController.showNotification(errorMsg, 'error');
            }
        };
        
        // 根据文件类型选择不同的读取方式
        if (fileType === 'csv') {
            reader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsArrayBuffer(file);
        }
    };
    
    // 触发文件选择对话框
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// 导出订单Excel
function exportOrderExcel() {
    // 获取所有订单记录
    const records = storage.getOrderRecords();
    
    // 准备导出数据
    const exportData = records.map(record => {
        return {
            '状态': record.status || '',
            '订单日期': record.orderDate || '',
            '订单号': record.orderNo || '',
            '客户': record.customer || '',
            '交货日期': record.deliveryDate || '',
            '交易条款': record.tradeTerms || '',
            '付款方式': record.paymentMethod || '',
            '运输方式': record.transportMethod || '',
            '产品名称': record.productName || '',
            '规格': record.spec || '',
            '图号': record.drawingNo || '',
            '电镀': record.plating || '',
            'LOGO': record.logo || '',
            '单位': record.unit || '',
            '数量': record.quantity || '',
            '单价': record.unitPrice || '',
            '金额': record.amount || '',
            '货币': record.currency || '',
            '包装': record.packing || '',
            '备注': record.remark || ''
        };
    });
    
    // 创建工作表，使用header选项指定列顺序，与页面表格保持一致
    const worksheet = XLSX.utils.json_to_sheet(exportData, { 
        header: [
            '状态',
            '订单日期',
            '客户',
            '订单号',
            '交货日期',
            '交易条款',
            '付款方式',
            '运输方式',
            '产品名称',
            '规格',
            '图号',
            '电镀',
            'LOGO',
            '单位',
            '单价',
            '数量',
            '金额',
            '货币',
            '包装',
            '备注'
        ]
    });
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '订单记录');
    
    // 导出文件
    XLSX.writeFile(workbook, '订单记录_' + new Date().toISOString().split('T')[0] + '.xlsx');
    
    // 显示成功提示
    pageController.showNotification('订单导出成功！', 'success');
}

// 打开客户统计模态框
function openCustomerStatsModal() {
    openModal('customerStatsModal');
    
    // 初始化年份下拉框
    initYearDropdown();
    
    // 更新客户统计数据
    updateCustomerStats();
}

// 初始化年份下拉框
function initYearDropdown() {
    const yearSelect = document.getElementById('customerStatsYear');
    if (!yearSelect) return;
    
    // 清除现有选项（保留"所有年份"）
    const allYearOption = yearSelect.querySelector('option[value="all"]');
    yearSelect.innerHTML = '';
    if (allYearOption) {
        yearSelect.appendChild(allYearOption);
    }
    
    // 添加固定年份选项（2020-2030年），按降序排列
    for (let year = 2030; year >= 2020; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
}

// 更新客户统计数据
function updateCustomerStats() {
    // 获取选中的年份
    const yearSelect = document.getElementById('customerStatsYear');
    const selectedYear = yearSelect ? yearSelect.value : 'all';
    
    // 客户统计数据的处理逻辑
    const allOrders = storage.getOrderRecords();
    
    // 按客户和货币分组计算金额
    const customerStats = {};
    
    // 汇率配置（简单示例，实际项目中可能需要更复杂的汇率处理）
    const exchangeRates = {
        'CNY': 1,
        'USD': 7.0,
        'EUR': 8.0,
        'GBP': 9.0
    };
    
    // 辅助函数：将值转换为日期时间戳，处理各种日期格式
    const toDate = (val) => {
        // 如果是数字，可能是Excel日期格式
        if (typeof val === 'number') {
            // Excel实际上是从1899年12月30日开始计算日期
            return new Date((val - 25568) * 86400000);
        }
        
        // 如果是字符串，尝试转换为日期
        if (typeof val === 'string') {
            // 尝试直接转换
            const jsDate = new Date(val);
            if (!isNaN(jsDate.getTime())) {
                return jsDate;
            }
            
            // 尝试处理其他日期格式（如2025/12/18）
            const altDate = new Date(val.replace(/\//g, '-'));
            if (!isNaN(altDate.getTime())) {
                return altDate;
            }
        }
        
        // 如果无法解析，返回当前日期（避免错误）
        return new Date();
    };
    
    // 计算每个客户的统计数据
    allOrders.forEach(order => {
        if (!order.customer) return;
        
        // 年份筛选
        if (selectedYear !== 'all') {
            // 使用辅助函数处理各种日期格式
            const orderDate = toDate(order.orderDate);
            const orderYear = orderDate.getFullYear().toString();
            if (orderYear !== selectedYear) return;
        }
        
        const currency = order.currency || 'CNY';
        const amount = parseFloat(order.amount || 0);
        if (isNaN(amount)) return;
        
        if (!customerStats[order.customer]) {
            customerStats[order.customer] = {};
        }
        
        if (!customerStats[order.customer][currency]) {
            customerStats[order.customer][currency] = {
                amount: 0,
                rate: exchangeRates[currency] || 1
            };
        }
        
        customerStats[order.customer][currency].amount += amount;
    });
    
    // 生成统计表格数据
    const tableBody = document.getElementById('customerStatsTableBody');
    const tableFoot = document.getElementById('customerStatsTableFoot');
    
    if (tableBody && tableFoot) {
        let tbodyHtml = '';
        let totalCNY = 0;
        let index = 1;
        
        // 将客户统计数据转换为数组，以便排序
        const statsArray = [];
        
        // 遍历客户统计数据，构建排序数组
        for (const [customer, currencies] of Object.entries(customerStats)) {
            for (const [currency, data] of Object.entries(currencies)) {
                const cnyAmount = data.amount * data.rate;
                totalCNY += cnyAmount;
                statsArray.push({
                    customer: customer,
                    currency: currency,
                    amount: data.amount,
                    rate: data.rate,
                    cnyAmount: cnyAmount
                });
            }
        }
        
        // 按人民币金额从高到低排序
        statsArray.sort((a, b) => {
            return b.cnyAmount - a.cnyAmount;
        });
        
        // 遍历排序后的数组生成表格HTML
        statsArray.forEach(item => {
            // 计算CNY占比
            const percentage = totalCNY > 0 ? (item.cnyAmount / totalCNY * 100).toFixed(2) : '0.00';
            
            tbodyHtml += `
                    <tr data-customer="${item.customer}" data-currency="${item.currency}">
                        <td>${index}</td>
                        <td>${item.customer}</td>
                        <td>${item.amount.toFixed(2)}</td>
                        <td>${item.currency}</td>
                        <td style="width: 100px;">
                            <input type="number" class="currency-rate form-input" 
                                   value="${item.rate.toFixed(2)}" step="0.01" min="0" 
                                   onchange="recalculateCNY(this, ${item.amount})" 
                                   style="width: 80px;">
                        </td>
                        <td class="cny-amount">${item.cnyAmount.toFixed(2)}</td>
                        <td class="percentage">${percentage}%</td>
                    </tr>
                `;
            index++;
        });
        
        // 如果没有数据，显示提示信息
        if (tbodyHtml === '') {
            tbodyHtml = '<tr><td colspan="7" class="text-center text-gray-500 py-4">暂无数据</td></tr>';
        }
        
        // 更新表格内容
        tableBody.innerHTML = tbodyHtml;
        
        // 更新页脚总合计
        tableFoot.innerHTML = `
            <tr>
                <td colspan="6" class="text-right font-bold">总合计（CNY）:</td>
                <td id="customerStatsTotal" class="font-bold text-primary">${totalCNY.toFixed(2)}</td>
            </tr>
        `;
    }
}

// 重新计算CNY金额
function recalculateCNY(rateInput, originalAmount) {
    const newRate = parseFloat(rateInput.value);
    if (isNaN(newRate)) return;
    
    // 更新当前行的CNY金额
    const cnyCell = rateInput.closest('tr').querySelector('.cny-amount');
    if (cnyCell) {
        const newCNY = (originalAmount * newRate).toFixed(2);
        cnyCell.textContent = newCNY;
    }
    
    // 重新计算总合计
    recalculateTotalCNY();
}

// 重新计算总合计CNY
function recalculateTotalCNY() {
    const cnyCells = document.querySelectorAll('.cny-amount');
    let totalCNY = 0;
    
    cnyCells.forEach(cell => {
        const amount = parseFloat(cell.textContent);
        if (!isNaN(amount)) {
            totalCNY += amount;
        }
    });
    
    // 更新总合计显示
    const totalCell = document.getElementById('customerStatsTotal');
    if (totalCell) {
        totalCell.textContent = totalCNY.toFixed(2);
    }
    
    // 重新计算所有客户的CNY占比
    const rows = document.querySelectorAll('#customerStatsTableBody tr');
    rows.forEach(row => {
        const cnyCell = row.querySelector('.cny-amount');
        const percentageCell = row.querySelector('.percentage');
        if (cnyCell && percentageCell) {
            const cnyAmount = parseFloat(cnyCell.textContent);
            if (!isNaN(cnyAmount)) {
                const percentage = totalCNY > 0 ? (cnyAmount / totalCNY * 100).toFixed(2) : '0.00';
                percentageCell.textContent = `${percentage}%`;
            }
        }
    });
}

// 订单搜索和筛选功能
// 搜索订单记录
function searchOrderRecords() {
    // 筛选条件变化时清空跨页选中状态，避免选中不在当前结果中的订单
    clearSelectedOrderIds();
    const customer = document.getElementById('orderCustomerSearch').value;
    const product = document.getElementById('orderProductSearch').value;
    const status = document.getElementById('orderStatusSearch').value;
    const plating = document.getElementById('orderPlatingSearch').value;
    const dateType = document.getElementById('orderDateType').value;
    const dateFrom = document.getElementById('orderOrDeliveryDateFrom').value;
    const dateTo = document.getElementById('orderOrDeliveryDateTo').value;
    
    // 获取所有订单记录
    const allOrders = storage.getOrderRecords();
    
    // 辅助函数：处理订单日期，将其转换为可比较的Date对象
    const processOrderDate = (dateValue) => {
        if (!dateValue) return null;
        
        if (typeof dateValue === 'string') {
            // 处理字符串格式的日期
            const dateMatch = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                return new Date(dateMatch[1]);
            }
            
            // 处理数值格式的日期（如Excel日期）
            const numDate = parseFloat(dateValue);
            if (!isNaN(numDate)) {
                // Excel实际上是从1899年12月30日开始计算日期
                const jsDate = new Date((numDate - 25568) * 86400000);
                jsDate.setDate(jsDate.getDate() - 1);
                return jsDate;
            }
        } else if (typeof dateValue === 'number') {
            // 处理数值类型的日期
            const jsDate = new Date((dateValue - 25568) * 86400000);
            jsDate.setDate(jsDate.getDate() - 1);
            return jsDate;
        }
        
        try {
            return new Date(dateValue);
        } catch (error) {
            return null;
        }
    };
    
    // 筛选订单记录
    const filteredOrders = allOrders.filter(order => {
        let match = true;
        
        // 客户筛选
        if (customer && order.customer && !order.customer.includes(customer)) {
            match = false;
        }
        
        // 产品名称筛选 - 支持以逗号分隔的多条件搜索
        if (product && order.productName) {
            // 拆分搜索词，支持逗号分隔
            const productTerms = product.split(',').map(term => term.trim()).filter(term => term.length > 0);
            if (productTerms.length > 0) {
                // 检查订单产品名称是否匹配任何一个搜索词
                const matchesAnyTerm = productTerms.some(term => 
                    order.productName.toLowerCase().includes(term.toLowerCase())
                );
                if (!matchesAnyTerm) {
                    match = false;
                }
            }
        }
        
        // 状态筛选
        if (status && order.status !== status) {
            match = false;
        }
        
        // 电镀筛选
        if (plating && order.plating !== plating) {
            match = false;
        }
        
        // 日期筛选
        if (dateFrom || dateTo) {
            const orderDate = processOrderDate(order[dateType]);
            const fromDate = dateFrom ? new Date(dateFrom) : null;
            const toDate = dateTo ? new Date(dateTo) : null;
            
            if (!orderDate) {
                match = false;
            } else {
                if (fromDate) fromDate.setHours(0, 0, 0, 0);
                if (toDate) toDate.setHours(0, 0, 0, 0);
                orderDate.setHours(0, 0, 0, 0);
                
                if (fromDate && orderDate < fromDate) {
                    match = false;
                }
                if (toDate && orderDate > toDate) {
                    match = false;
                }
            }
        }
        
        return match;
    });
    
    // 更新表格
    pageController.renderOrderTable(filteredOrders);
}

// 重置订单筛选条件
function resetOrderFilters() {
    // 重置筛选条件时清空跨页选中状态
    clearSelectedOrderIds();
    document.getElementById('orderCustomerSearch').value = '';
    document.getElementById('orderProductSearch').value = '';
    document.getElementById('orderStatusSearch').value = '';
    document.getElementById('orderPlatingSearch').value = '';
    document.getElementById('orderDateType').value = 'orderDate';
    document.getElementById('orderOrDeliveryDateFrom').value = '';
    document.getElementById('orderOrDeliveryDateTo').value = '';
    
    // 隐藏搜索建议
    document.getElementById('customerSuggestions').classList.add('hidden');
    document.getElementById('orderCustomerSuggestions').classList.add('hidden');
    document.getElementById('orderNoSuggestions').classList.add('hidden');
    
    // 重置分页数据，显示所有订单
    const allOrders = storage.getOrderRecords();
    pageController.renderOrderTable(allOrders);
}

// 客户搜索建议
function filterCustomers(searchTerm) {
    const suggestions = document.getElementById('customerSuggestions');
    if (!suggestions) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取所有客户名称
    const allOrders = storage.getOrderRecords();
    const customers = [...new Set(allOrders.map(order => order.customer).filter(Boolean))];
    
    // 筛选匹配的客户
    const filteredCustomers = customers.filter(customer => 
        customer.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filteredCustomers.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        filteredCustomers.forEach(customer => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = customer;
            div.addEventListener('click', () => {
                document.getElementById('orderCustomerSearch').value = customer;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示客户搜索建议
function showCustomerSuggestions() {
    const suggestions = document.getElementById('customerSuggestions');
    if (suggestions) {
        const searchTerm = document.getElementById('orderCustomerSearch').value;
        if (searchTerm) {
            filterCustomers(searchTerm);
        }
    }
}

// 订单客户搜索建议
function filterOrderCustomers(searchTerm) {
    const suggestions = document.getElementById('orderCustomerSuggestions');
    if (!suggestions) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取所有客户名称
    const allOrders = storage.getOrderRecords();
    const customers = [...new Set(allOrders.map(order => order.customer).filter(Boolean))];
    
    // 筛选匹配的客户
    const filteredCustomers = customers.filter(customer => 
        customer.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filteredCustomers.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        filteredCustomers.forEach(customer => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = customer;
            div.addEventListener('click', () => {
                document.getElementById('orderCustomer').value = customer;
                document.getElementById('editOrderCustomer').value = customer;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示订单客户搜索建议
function showOrderCustomerSuggestions() {
    const suggestions = document.getElementById('orderCustomerSuggestions');
    if (suggestions) {
        const searchTerm = document.getElementById('orderCustomer').value || document.getElementById('editOrderCustomer').value;
        if (searchTerm) {
            filterOrderCustomers(searchTerm);
        }
    }
}

// 订单号搜索建议
function filterOrderNumbers(searchTerm) {
    const suggestions = document.getElementById('orderNoSuggestions');
    if (!suggestions) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取最后一个逗号后的内容作为当前搜索词
    const lastCommaIndex = searchTerm.lastIndexOf(',');
    const currentSearchTerm = lastCommaIndex === -1 ? searchTerm : searchTerm.substring(lastCommaIndex + 1).trim();
    
    if (!currentSearchTerm) return;
    
    // 获取所有订单号
    const allOrders = storage.getOrderRecords();
    const orderNumbers = [...new Set(allOrders.map(order => order.orderNo).filter(Boolean))];
    
    // 筛选匹配的订单号
    const filteredOrderNumbers = orderNumbers.filter(orderNo => {
        // 确保orderNo是字符串类型
        const orderNoStr = String(orderNo);
        const searchTermStr = String(searchTerm);
        return orderNoStr.toLowerCase().includes(searchTermStr.toLowerCase());
    });
    
    if (filteredOrderNumbers.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        filteredOrderNumbers.forEach(orderNo => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = orderNo;
            div.addEventListener('click', () => {
                document.getElementById('orderNo').value = orderNo;
                document.getElementById('editOrderNo').value = orderNo;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示订单号搜索建议
function showOrderNumberSuggestions() {
    const suggestions = document.getElementById('orderNoSuggestions');
    if (suggestions) {
        const searchTerm = document.getElementById('orderNo').value || document.getElementById('editOrderNo').value;
        if (searchTerm) {
            filterOrderNumbers(searchTerm);
        }
    }
}

// 产品搜索建议
function filterProducts(searchTerm, inputElement) {
    if (!inputElement) return;
    
    // 找到建议列表容器
    const suggestions = inputElement.nextElementSibling;
    if (!suggestions || !suggestions.classList.contains('absolute')) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取所有产品名称（从订单记录中）
    const allOrders = storage.getOrderRecords();
    const products = [...new Set(allOrders.map(order => order.productName).filter(name => name && name.toLowerCase().includes(searchTerm.toLowerCase())))];
    
    if (products.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        products.forEach(product => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = product;
            div.addEventListener('click', () => {
                // 设置产品名称
                inputElement.value = product;
                suggestions.classList.add('hidden');
                
                // 根据产品名称自动填充规格和图号
                fillProductDetails(product, inputElement);
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示产品搜索建议
function showProductSuggestions(inputElement) {
    if (!inputElement) return;
    
    const searchTerm = inputElement.value;
    if (searchTerm) {
        filterProducts(searchTerm, inputElement);
    }
}

// 根据产品名称自动填充规格和图号
function fillProductDetails(productName, inputElement) {
    // 找到当前产品行
    const productRow = inputElement.closest('.product-row');
    if (!productRow) return;
    
    // 查找规格和图号输入框
    const specInput = productRow.querySelector('input[name="spec"]');
    const drawingNoInput = productRow.querySelector('input[name="drawingNo"]');
    
    // 从订单记录中查找该产品的规格和图号
    const allOrders = storage.getOrderRecords();
    const matchingOrders = allOrders.filter(order => order.productName === productName);
    
    if (matchingOrders.length > 0) {
        // 获取唯一的规格和图号
        const specs = [...new Set(matchingOrders.map(order => order.spec).filter(Boolean))];
        const drawingNos = [...new Set(matchingOrders.map(order => order.drawingNo).filter(Boolean))];
        
        // 如果只有一个规格，自动填充
        if (specs.length === 1 && specInput) {
            specInput.value = specs[0];
        }
        
        // 如果只有一个图号，自动填充
        if (drawingNos.length === 1 && drawingNoInput) {
            drawingNoInput.value = drawingNos[0];
        }
    }
}

// 规格搜索建议
function filterSpecs(searchTerm, inputElement) {
    if (!inputElement) return;
    
    // 找到建议列表容器
    const suggestions = inputElement.nextElementSibling;
    if (!suggestions || !suggestions.classList.contains('absolute')) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取当前产品行的产品名称
    const productRow = inputElement.closest('.product-row');
    if (!productRow) return;
    
    const productNameInput = productRow.querySelector('input[name="productName"]');
    const productName = productNameInput ? productNameInput.value : '';
    
    // 获取所有规格（根据产品名称过滤）
    const allOrders = storage.getOrderRecords();
    let specs;
    
    if (productName) {
        specs = [...new Set(allOrders.filter(order => order.productName === productName && order.spec && order.spec.toLowerCase().includes(searchTerm.toLowerCase())).map(order => order.spec))];
    } else {
        specs = [...new Set(allOrders.map(order => order.spec).filter(spec => spec && spec.toLowerCase().includes(searchTerm.toLowerCase())))];
    }
    
    if (specs.length > 0) {
        suggestions.classList.remove('hidden');
        
        specs.forEach(spec => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = spec;
            div.addEventListener('click', () => {
                inputElement.value = spec;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示规格搜索建议
function showSpecSuggestions(inputElement) {
    if (!inputElement) return;
    
    const searchTerm = inputElement.value;
    if (searchTerm) {
        filterSpecs(searchTerm, inputElement);
    }
}

// 规格搜索建议
function filterSpecs(searchTerm, inputElement) {
    if (!inputElement) return;
    
    // 找到建议列表容器
    const suggestions = inputElement.nextElementSibling;
    if (!suggestions || !suggestions.classList.contains('absolute')) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取当前产品行的产品名称
    const productRow = inputElement.closest('.product-row');
    if (!productRow) return;
    
    const productNameInput = productRow.querySelector('input[name="productName"]');
    const productName = productNameInput ? productNameInput.value : '';
    
    // 获取所有规格（根据产品名称过滤）
    const allOrders = storage.getOrderRecords();
    let specs;
    
    if (productName) {
        specs = [...new Set(allOrders.filter(order => order.productName === productName && order.spec && order.spec.toLowerCase().includes(searchTerm.toLowerCase())).map(order => order.spec))];
    } else {
        specs = [...new Set(allOrders.map(order => order.spec).filter(spec => spec && spec.toLowerCase().includes(searchTerm.toLowerCase())))];
    }
    
    if (specs.length > 0) {
        suggestions.classList.remove('hidden');
        
        specs.forEach(spec => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = spec;
            div.addEventListener('click', () => {
                inputElement.value = spec;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示规格搜索建议
function showSpecSuggestions(inputElement) {
    if (!inputElement) return;
    
    const searchTerm = inputElement.value;
    if (searchTerm) {
        filterSpecs(searchTerm, inputElement);
    }
}

// 图号搜索建议
function filterDrawingNos(searchTerm, inputElement) {
    if (!inputElement) return;
    
    // 找到建议列表容器
    const suggestions = inputElement.nextElementSibling;
    if (!suggestions || !suggestions.classList.contains('absolute')) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取当前产品行的产品名称和规格
    const productRow = inputElement.closest('.product-row');
    if (!productRow) return;
    
    const productNameInput = productRow.querySelector('input[name="productName"]');
    const productName = productNameInput ? productNameInput.value : '';
    
    const specInput = productRow.querySelector('input[name="spec"]');
    const spec = specInput ? specInput.value : '';
    
    // 获取所有图号（根据产品名称和规格过滤）
    const allOrders = storage.getOrderRecords();
    let drawingNos;
    
    if (productName && spec) {
        drawingNos = [...new Set(allOrders.filter(order => order.productName === productName && order.spec === spec && order.drawingNo && order.drawingNo.toLowerCase().includes(searchTerm.toLowerCase())).map(order => order.drawingNo))];
    } else if (productName) {
        drawingNos = [...new Set(allOrders.filter(order => order.productName === productName && order.drawingNo && order.drawingNo.toLowerCase().includes(searchTerm.toLowerCase())).map(order => order.drawingNo))];
    } else {
        drawingNos = [...new Set(allOrders.map(order => order.drawingNo).filter(dn => dn && dn.toLowerCase().includes(searchTerm.toLowerCase())))];
    }
    
    if (drawingNos.length > 0) {
        suggestions.classList.remove('hidden');
        
        drawingNos.forEach(drawingNo => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = drawingNo;
            div.addEventListener('click', () => {
                inputElement.value = drawingNo;
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示图号搜索建议
function showDrawingNoSuggestions(inputElement) {
    if (!inputElement) return;
    
    const searchTerm = inputElement.value;
    if (searchTerm) {
        filterDrawingNos(searchTerm, inputElement);
    }
}

// 付款记录订单号搜索建议
function filterPaymentOrderNumbers(searchTerm) {
    const suggestions = document.getElementById('paymentOrderNoSuggestions');
    if (!suggestions) return;
    
    // 隐藏建议列表
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    
    if (!searchTerm) return;
    
    // 获取最后一个逗号后的内容作为当前搜索词
    const lastCommaIndex = searchTerm.lastIndexOf(',');
    const currentSearchTerm = lastCommaIndex === -1 ? searchTerm : searchTerm.substring(lastCommaIndex + 1).trim();
    
    if (!currentSearchTerm) return;
    
    // 获取所有订单号
    const allOrders = storage.getOrderRecords();
    const orderNumbers = [...new Set(allOrders.map(order => order.orderNo).filter(Boolean))];
    
    // 筛选匹配的订单号
    const filteredOrderNumbers = orderNumbers.filter(orderNo => {
        // 确保orderNo是字符串类型
        const orderNoStr = String(orderNo);
        const searchTermStr = String(currentSearchTerm);
        return orderNoStr.toLowerCase().includes(searchTermStr.toLowerCase());
    });
    
    if (filteredOrderNumbers.length > 0) {
        // 显示建议列表
        suggestions.classList.remove('hidden');
        
        // 添加建议项
        filteredOrderNumbers.forEach(orderNo => {
            const div = document.createElement('div');
            div.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
            div.textContent = orderNo;
            div.addEventListener('click', () => {
                // 填充订单号
                const orderNoInput = document.getElementById('paymentOrderNo');
                const currentValue = orderNoInput.value;
                const lastCommaIndex = currentValue.lastIndexOf(',');
                
                // 构建新的订单号字符串
                let newValue;
                if (lastCommaIndex === -1) {
                    newValue = orderNo;
                } else {
                    const prefix = currentValue.substring(0, lastCommaIndex + 1);
                    newValue = `${prefix} ${orderNo}`;
                }
                
                orderNoInput.value = newValue;
                
                // 自动填充客户信息（如果只有一个订单号）
                const allOrders = storage.getOrderRecords();
                const selectedOrder = allOrders.find(order => order.orderNo === orderNo);
                if (selectedOrder && selectedOrder.customer) {
                    document.getElementById('paymentCustomer').value = selectedOrder.customer;
                }
                
                // 关闭建议列表
                suggestions.classList.add('hidden');
            });
            suggestions.appendChild(div);
        });
    }
}

// 显示付款记录订单号搜索建议
function showPaymentOrderNumberSuggestions() {
    const suggestions = document.getElementById('paymentOrderNoSuggestions');
    if (suggestions) {
        const searchTerm = document.getElementById('paymentOrderNo').value;
        if (searchTerm) {
            filterPaymentOrderNumbers(searchTerm);
        }
    }
}

// 汇总订单号预付款金额
function calculateTotalAdvancePayments(orderNumbers) {
    // 获取所有付款记录
    const paymentRecords = storage.getPaymentRecords();
    let totalAdvance = 0;
    
    // 遍历所有订单号
    orderNumbers.forEach(orderNo => {
        // 筛选出该订单号的预付款记录
        const advancePayments = paymentRecords.filter(record => {
            return record.orderNo && record.orderNo.includes(orderNo) && 
                   record.paymentMethod === '预付款' && 
                   record.amount;
        });
        
        // 汇总金额
        advancePayments.forEach(payment => {
            totalAdvance += parseFloat(payment.amount);
        });
    });
    
    return totalAdvance;
}

// 更新付款金额提示
function updatePaymentAmountHint() {
    // 获取订单号输入框的值
    const orderNoInput = document.getElementById('paymentOrderNo');
    if (!orderNoInput) return;
    
    const orderNoValue = orderNoInput.value;
    if (!orderNoValue) return;
    
    // 将订单号字符串分割成数组
    const orderNumbers = orderNoValue.split(',').map(no => no.trim()).filter(Boolean);
    if (orderNumbers.length === 0) return;
    
    // 汇总预付款金额
    const totalAdvance = calculateTotalAdvancePayments(orderNumbers);
    
    // 更新付款金额输入框的title属性
    const paymentAmountInput = document.getElementById('paymentAmount');
    if (paymentAmountInput) {
        paymentAmountInput.dataset.totalAdvance = totalAdvance;
    }
}

// 显示付款金额提示
function showPaymentAmountHint(element) {
    // 获取付款类型
    const paymentTypeSelect = document.getElementById('paymentType');
    if (!paymentTypeSelect || paymentTypeSelect.value !== '余款') {
        return;
    }
    
    // 获取订单号输入框的值
    const orderNoInput = document.getElementById('paymentOrderNo');
    if (!orderNoInput) return;
    
    const orderNoValue = orderNoInput.value;
    if (!orderNoValue) return;
    
    // 将订单号字符串分割成数组
    const orderNumbers = orderNoValue.split(',').map(no => no.trim()).filter(Boolean);
    if (orderNumbers.length === 0) return;
    
    // 汇总预付款金额
    const totalAdvance = calculateTotalAdvancePayments(orderNumbers);
    
    // 显示提示
    element.title = `该订单已付预付款总额：${totalAdvance.toFixed(2)}`;
}

// 导入付款记录Excel
function importPaymentExcel() {
    // 创建文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 检查文件类型
        const fileType = file.name.split('.').pop().toLowerCase();
        const validTypes = ['xlsx', 'xls', 'csv'];
        if (!validTypes.includes(fileType)) {
            pageController.showNotification('不支持的文件类型，请选择.xlsx、.xls或.csv文件', 'error');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                let workbook;
                
                // 根据文件类型选择不同的读取方式
                if (fileType === 'csv') {
                    // 处理CSV文件
                    const text = event.target.result;
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    // 处理Excel文件
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' });
                }
                
                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('无效的Excel文件，无法读取工作表');
                }
                
                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    throw new Error('无法读取工作表数据');
                }
                
                // 将工作表转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                // 处理导入的数据
                jsonData.forEach(row => {
                    // 转换数据格式
                    const paymentRecord = {
                        id: Date.now().toString(),
                        customer: row['客户'] || '',
                        orderNo: row['订单号'] || '',
                        paymentDate: row['付款日期'] || '',
                        amount: row['付款金额'] ? parseFloat(row['付款金额']).toFixed(2) : '',
                        paymentMethod: row['付款类型'] || '',
                        remark: row['备注'] || ''
                    };
                    
                    // 保存到本地存储
                    storage.addPaymentRecord(paymentRecord);
                });
                
                // 重新渲染表格
                pageController.renderPaymentTable();
                pageController.updateReports();
                pageController.showNotification('付款记录导入成功', 'success');
            } catch (error) {
                pageController.showNotification('导入失败：' + error.message, 'error');
                console.error('导入付款记录失败:', error);
            }
        };
        
        reader.onerror = () => {
            pageController.showNotification('读取文件失败', 'error');
        };
        
        // 读取文件
        if (fileType === 'csv') {
            reader.readAsText(file, 'utf-8');
        } else {
            reader.readAsArrayBuffer(file);
        }
    };
    
    // 触发文件选择对话框
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// 导出付款记录Excel
function exportPaymentExcel() {
    // 获取所有付款记录
    const paymentRecords = storage.getPaymentRecords();
    
    if (paymentRecords.length === 0) {
        pageController.showNotification('没有数据可以导出', 'warning');
        return;
    }
    
    // 准备导出数据
    const exportData = paymentRecords.map(record => ({
        '客户': record.customer || '',
        '订单号': record.orderNo || '',
        '付款日期': record.paymentDate || '',
        '付款金额': record.amount || '',
        '付款类型': record.paymentMethod || '',
        '备注': record.remark || ''
    }));
    
    // 创建工作表
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '付款记录');
    
    // 导出文件
    const fileName = `付款记录_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    pageController.showNotification('付款记录导出成功', 'success');
}

// 清空所有付款记录
function clearAllPayments() {
    if (confirm('确定要清空所有付款记录吗？此操作不可恢复！')) {
        // 清空付款记录
        storage.paymentRecords = [];
        
        // 更新分页数据并重新渲染
        paginations.payment.setData([]);
        pageController.renderPaymentTable();
        pageController.updateReports();
        
        // 显示成功通知
        pageController.showNotification('所有付款记录已清空', 'success');
    }
}

// 清空所有发票记录
function clearAllInvoices() {
    if (confirm('确定要清空所有发票记录吗？此操作不可恢复！')) {
        // 清空发票记录
        storage.invoiceRecords = [];
        
        // 更新分页数据并重新渲染
        paginations.invoice.setData([]);
        pageController.renderInvoiceTable();
        pageController.updateReports();
        
        // 显示成功通知
        pageController.showNotification('所有发票记录已清空', 'success');
    }
}

// 搜索发票记录
function searchInvoiceRecords() {
    // 获取筛选条件
    const customer = document.getElementById('invoiceCustomerSearch').value;
    const payee = document.getElementById('invoicePayeeSearch').value;
    const statusFilter = document.getElementById('invoiceStatusFilter').value;
    const dateFrom = document.getElementById('invoiceDateFrom').value;
    const dateTo = document.getElementById('invoiceDateTo').value;
    
    // 获取所有发票记录和付款记录
    const allInvoiceRecords = storage.getInvoiceRecords();
    const allPaymentRecords = storage.getPaymentRecords();
    
    // 按订单号汇总付款金额
    const paymentByOrderNo = {};
    allPaymentRecords.forEach(payment => {
        if (payment.orderNo) {
            const paymentOrderNos = payment.orderNo.split(',').map(no => no.trim()).filter(Boolean);
            paymentOrderNos.forEach(orderNo => {
                if (!paymentByOrderNo[orderNo]) {
                    paymentByOrderNo[orderNo] = 0;
                }
                paymentByOrderNo[orderNo] += parseFloat(payment.amount) || 0;
            });
        }
    });
    
    // 获取发票状态的辅助函数
    const getInvoiceStatus = (record) => {
        const invoiceAmount = parseFloat(record.amount || 0);
        const orderNos = (record.orderNo || '').split(',').map(no => no.trim()).filter(Boolean);
        const totalPaymentAmount = orderNos.reduce((total, orderNo) => {
            return total + (paymentByOrderNo[orderNo] || 0);
        }, 0);
        
        if (totalPaymentAmount === 0) {
            return '未付款';
        } else if (invoiceAmount > 0 && totalPaymentAmount < invoiceAmount) {
            return '部分付款';
        } else if (invoiceAmount > 0 && totalPaymentAmount >= invoiceAmount) {
            return '已付清';
        } else {
            // 发票金额为0或NaN时，有付款但无法判断是否付清，视为部分付款
            return totalPaymentAmount > 0 ? '部分付款' : '未付款';
        }
    };
    
    // 应用筛选条件
    const filteredRecords = allInvoiceRecords.filter(record => {
        // 客户筛选
        if (customer && record.customer !== customer) {
            return false;
        }
        
        // 收款单位筛选
        if (payee && record.payee !== payee) {
            return false;
        }
        
        // 状态筛选
        if (statusFilter) {
            const invoiceStatus = getInvoiceStatus(record);
            if (invoiceStatus !== statusFilter) {
                return false;
            }
        }
        
        // 日期筛选
        if (dateFrom && record.invoiceDate < dateFrom) {
            return false;
        }
        
        if (dateTo && record.invoiceDate > dateTo) {
            return false;
        }
        
        return true;
    });
    
    // 更新分页数据并重新渲染（传入筛选后的数据）
    paginations.invoice.setData(filteredRecords);
    pageController.renderInvoiceTable(filteredRecords);
}

// 重置发票筛选条件
function resetInvoiceFilters() {
    // 清空所有筛选条件
    document.getElementById('invoiceCustomerSearch').value = '';
    document.getElementById('invoicePayeeSearch').value = '';
    document.getElementById('invoiceStatusFilter').value = '';
    document.getElementById('invoiceDateFrom').value = '';
    document.getElementById('invoiceDateTo').value = '';
    // 清空搜索框
    const searchInput = document.getElementById('invoiceSearch');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // 调用handleInvoiceSearch方法，实现统一的搜索和筛选功能
    pageController.handleInvoiceSearch();
}

// 编辑开票记录
function editInvoiceRecord(id) {
    // 获取所有发票记录
    const invoiceRecords = storage.getInvoiceRecords();
    
    // 根据ID查找记录（支持带索引的ID）
    const record = invoiceRecords.find(record => record.id === id || record.id.startsWith(id + '_'));
    
    if (!record) {
        pageController.showNotification('找不到该开票记录', 'error');
        return;
    }
    
    // 填充编辑表单
    document.getElementById('editInvoiceId').value = record.id;
    document.getElementById('editInvoiceCustomer').value = record.customer || '';
    document.getElementById('editInvoiceOrderNo').value = record.orderNo || '';
    document.getElementById('editInvoiceShipmentNo').value = record.shipmentNo || '';
    document.getElementById('editInvoicePayer').value = record.payer || '';
    document.getElementById('editInvoiceDate').value = record.invoiceDate || '';
    document.getElementById('editInvoiceAgentFee').value = record.agentFee || '0';
    document.getElementById('editInvoiceDomesticFreight').value = record.domesticFreight || '0';
    document.getElementById('editInvoiceOverseasFreight').value = record.overseasFreight || '0';
    document.getElementById('editInvoiceRemark').value = record.remark || '';
    
    // 填充商品条目
    const container = document.getElementById('editInvoiceItemsContainer');
    // 清空现有条目（保留第一个）
    while (container.children.length > 1) {
        container.removeChild(container.lastChild);
    }
    
    // 填充第一个条目
    const firstItem = container.querySelector('.edit-invoice-item');
    if (firstItem) {
        firstItem.querySelector('.edit-invoice-item-name').value = record.itemName || '';
        firstItem.querySelector('.edit-invoice-item-price').value = record.unitPrice || '';
        firstItem.querySelector('.edit-invoice-item-quantity').value = record.quantity || '';
        firstItem.querySelector('.edit-invoice-item-amount').value = record.amount || '';
    }
    
    // 计算开票金额
    calculateEditInvoiceAmount();
    
    // 处理收款单位
    const payee = record.payee || '';
    const payeeSelect = document.getElementById('editInvoicePayeeSelect');
    const payeeInput = document.getElementById('editInvoicePayeeInput');
    const payeeHidden = document.getElementById('editInvoicePayee');
    
    if (payeeSelect && payeeInput && payeeHidden) {
        // 检查收款单位是否在选项中
        const optionExists = Array.from(payeeSelect.options).some(option => 
            option.value === payee
        );
        
        if (optionExists) {
            payeeSelect.value = payee;
            payeeInput.classList.add('hidden');
            payeeHidden.value = payee;
        } else {
            payeeSelect.value = 'other';
            payeeInput.classList.remove('hidden');
            payeeInput.value = payee;
            payeeHidden.value = payee;
        }
    }
    
    // 处理收汇总额
    const receiptTotal = record.receiptTotal || '';
    const receiptTotalInput = document.getElementById('editInvoiceReceiptTotal');
    if (receiptTotalInput) {
        receiptTotalInput.value = receiptTotal;
    }
    
    // 打开编辑模态框
    openModal('editInvoiceModal');
    
    // 初始化编辑模态框的事件
    initEditInvoiceModalEvents();
}

// 初始化编辑开票记录模态框的事件
function initEditInvoiceModalEvents() {
    // 收款单位选择事件
    const payeeSelect = document.getElementById('editInvoicePayeeSelect');
    const payeeInput = document.getElementById('editInvoicePayeeInput');
    const payeeHidden = document.getElementById('editInvoicePayee');
    
    if (payeeSelect && payeeInput && payeeHidden) {
        payeeSelect.addEventListener('change', function() {
            if (this.value === 'other') {
                payeeInput.classList.remove('hidden');
                payeeHidden.value = payeeInput.value;
            } else {
                payeeInput.classList.add('hidden');
                payeeHidden.value = this.value;
            }
        });
        
        payeeInput.addEventListener('input', function() {
            payeeHidden.value = this.value;
        });
    }
}

// 保存编辑后的开票记录
function saveEditInvoiceRecord(e) {
    e.preventDefault();
    const form = e.target;
    
    // 获取公共字段数据
    const commonData = {
        customer: document.getElementById('editInvoiceCustomer').value,
        orderNo: document.getElementById('editInvoiceOrderNo').value,
        shipmentNo: document.getElementById('editInvoiceShipmentNo').value,
        payer: document.getElementById('editInvoicePayer').value,
        invoiceDate: document.getElementById('editInvoiceDate').value,
        agentFee: document.getElementById('editInvoiceAgentFee').value,
        domesticFreight: document.getElementById('editInvoiceDomesticFreight').value,
        overseasFreight: document.getElementById('editInvoiceOverseasFreight').value,
        remark: document.getElementById('editInvoiceRemark').value
    };
    
    // 确保收款单位值正确
    const payeeSelect = document.getElementById('editInvoicePayeeSelect');
    const payeeInput = document.getElementById('editInvoicePayeeInput');
    if (payeeSelect && payeeInput) {
        if (payeeSelect.value === 'other') {
            commonData.payee = payeeInput.value;
        } else {
            commonData.payee = payeeSelect.value;
        }
    }
    
    // 处理收汇总额
    const receiptTotal = document.getElementById('editInvoiceReceiptTotal').value;
    if (receiptTotal) {
        commonData.receiptTotal = receiptTotal.replace(/[US$EU$￥\s]/g, '');
    }
    
    // 获取商品条目数据
    const items = [];
    const itemContainers = document.querySelectorAll('.edit-invoice-item');
    itemContainers.forEach((container, index) => {
        const name = container.querySelector('.edit-invoice-item-name').value;
        const price = container.querySelector('.edit-invoice-item-price').value;
        const quantity = container.querySelector('.edit-invoice-item-quantity').value;
        const amount = container.querySelector('.edit-invoice-item-amount').value;
        
        if (name && price && quantity) {
            items.push({
                index: index,
                name: name,
                price: parseFloat(price),
                quantity: parseFloat(quantity),
                amount: parseFloat(amount)
            });
        }
    });
    
    if (items.length === 0) {
        pageController.showNotification('请至少添加一个商品', 'error');
        return;
    }
    
    // 获取所有发票记录
    const invoiceRecords = storage.getInvoiceRecords();
    
    // 获取原始记录的ID基础（去掉索引部分）
    const originalId = document.getElementById('editInvoiceId').value;
    const idBase = originalId.split('_')[0];
    
    // 删除同一发票的所有相关记录
    const updatedRecords = invoiceRecords.filter(record => !record.id.startsWith(idBase + '_') && record.id !== idBase);
    
    // 添加新的记录，每个产品作为单独一行
    items.forEach((item, index) => {
        const record = {
            ...commonData,
            id: idBase + '_' + index,
            itemName: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            amount: item.amount,
            itemIndex: index
        };
        updatedRecords.push(record);
    });
    
    storage.invoiceRecords = updatedRecords;
    
    // 更新分页数据并重新渲染
    paginations.invoice.updateData(updatedRecords);
    pageController.renderInvoiceTable();
    pageController.updateReports();
    
    // 显示成功通知
    pageController.showNotification('开票记录更新成功', 'success');
    
    // 关闭模态框
    closeModal('editInvoiceModal');
}

// 删除开票记录
function deleteInvoiceRecord(id) {
    if (confirm('确定要删除该开票记录吗？此操作不可恢复！')) {
        // 获取所有发票记录
        const invoiceRecords = storage.getInvoiceRecords();
        
        // 过滤掉要删除的记录
        const updatedRecords = invoiceRecords.filter(record => record.id !== id);
        
        if (updatedRecords.length < invoiceRecords.length) {
            // 更新storage
            storage.invoiceRecords = updatedRecords;
            
            // 重新渲染表格，它会处理分页数据的更新
            pageController.renderInvoiceTable();
            pageController.updateReports();
            
            // 显示成功通知
            pageController.showNotification('开票记录删除成功', 'success');
        } else {
            pageController.showNotification('找不到该开票记录', 'error');
        }
    }
}

// 导入发票记录Excel
function importInvoiceExcel() {
    // 创建文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';

    // 立即触发文件选择对话框
    fileInput.click();

    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 检查文件类型
        const fileType = file.name.split('.').pop().toLowerCase();
        const validTypes = ['xlsx', 'xls', 'csv'];
        if (!validTypes.includes(fileType)) {
            pageController.showNotification('不支持的文件类型，请选择.xlsx、.xls或.csv文件', 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                let workbook;

                // 根据文件类型选择不同的读取方式
                if (fileType === 'csv') {
                    // 处理CSV文件
                    const text = event.target.result;
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    // 处理Excel文件
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' });
                }

                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('无效的Excel文件，无法读取工作表');
                }

                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    throw new Error('无法读取工作表数据');
                }

                // 将工作表转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // 处理导入的数据
                const importedRecords = jsonData.map((row, index) => {
                    return {
                        id: Date.now().toString() + index,
                        customer: row['客户'] || row['customer'] || '',
                        orderNo: row['订单号'] || row['orderNo'] || '',
                        shipmentNo: row['运编号'] || row['shipmentNo'] || '',
                        payer: row['付款单位'] || row['payer'] || '',
                        payee: row['收款单位'] || row['payee'] || '',
                        receiptTotal: row['收汇总额'] || row['receiptTotal'] || '',
                        invoiceDate: row['开票日期'] || row['invoiceDate'] || '',
                        quantity: row['开票数量'] || row['quantity'] || '',
                        unitPrice: row['开票单价'] || row['unitPrice'] || '',
                        amount: row['开票金额'] || row['amount'] || '',
                        agentFee: row['代理费'] || row['agentFee'] || '',
                        domesticFreight: row['国内运杂费'] || row['domesticFreight'] || '',
                        overseasFreight: row['海外运杂费'] || row['overseasFreight'] || '',
                        remark: row['备注'] || row['remark'] || ''
                    };
                });

                // 保存到localStorage
                const currentRecords = storage.getInvoiceRecords();
                const updatedRecords = [...currentRecords, ...importedRecords];
                localStorage.setItem('invoiceRecords', JSON.stringify(updatedRecords));

                // 直接更新分页数据并重新渲染发票表格
                paginations.invoice.updateData(updatedRecords);
                pageController.renderInvoiceTable();
                pageController.updateReports();

                // 显示成功提示
                pageController.showNotification('发票记录导入成功！导入了 ' + importedRecords.length + ' 条记录', 'success');
            } catch (error) {
                console.error('Excel解析失败:', error);
                pageController.showNotification('Excel解析失败，请检查文件格式！错误信息：' + error.message, 'error');
            }
        };

        reader.onerror = (error) => {
            console.error('文件读取失败:', error);
            pageController.showNotification('文件读取失败，请重试！', 'error');
        };

        reader.readAsArrayBuffer(file);
    };
}

// 导出发票记录Excel
function exportInvoiceExcel() {
    try {
        // 获取所有发票记录
        const invoiceRecords = storage.getInvoiceRecords();

        // 准备导出数据，只包含需要的字段
        const exportData = invoiceRecords.map(record => ({
            '客户': record.customer || '',
            '订单号': record.orderNo || '',
            '运编号': record.shipmentNo || '',
            '付款单位': record.payer || '',
            '收款单位': record.payee || '',
            '收汇总额': record.receiptTotal || '',
            '开票日期': record.invoiceDate || '',
            '开票数量': record.quantity || '',
            '开票单价': record.unitPrice || '',
            '开票金额': record.amount || '',
            '代理费': record.agentFee || '',
            '国内运杂费': record.domesticFreight || '',
            '海外运杂费': record.overseasFreight || '',
            '备注': record.remark || ''
        }));

        // 创建工作表和工作簿
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '发票记录');

        // 导出Excel文件
        const fileName = `发票记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        // 显示成功提示
        pageController.showNotification('发票记录导出成功！', 'success');
    } catch (error) {
        console.error('Excel导出失败:', error);
        pageController.showNotification('Excel导出失败，请重试！错误信息：' + error.message, 'error');
    }
}

// 编辑付款记录
function editPayment(id) {
    // 获取所有付款记录
    const paymentRecords = storage.getPaymentRecords();
    
    // 根据ID查找记录
    const record = paymentRecords.find(record => record.id === id);
    
    if (!record) {
        pageController.showNotification('找不到该付款记录', 'error');
        return;
    }
    
    // 填充编辑表单
    document.getElementById('editPaymentId').value = record.id;
    document.getElementById('editPaymentCustomer').value = record.customer || '';
    document.getElementById('editPaymentOrderNo').value = record.orderNo || '';
    document.getElementById('editPaymentDate').value = record.paymentDate || '';
    document.getElementById('editPaymentAmount').value = record.amount || '';
    document.getElementById('editPaymentType').value = record.paymentMethod || '预付款';
    document.getElementById('editPaymentPayer').value = record.payer || '无锡市天梁对外贸易有限公司';
    document.getElementById('editPaymentRemark').value = record.remark || '';
    
    // 打开编辑模态框
    openModal('editPaymentModal');
    
    // 处理收款单位（模态框打开后执行）
    setTimeout(function() {
        const recipientValue = record.recipient || '';
        const recipientSelect = document.getElementById('editPaymentRecipientSelect');
        const recipientInput = document.getElementById('editPaymentRecipientInput');
        const recipientHidden = document.getElementById('editPaymentRecipient');
        
        if (recipientSelect && recipientInput && recipientHidden) {
            // 设置收款单位值
            recipientHidden.value = recipientValue;
            
            // 检查值是否在下拉选项中
            const optionExists = Array.from(recipientSelect.options).some(option => option.value === recipientValue);
            
            if (optionExists) {
                // 如果值在选项中，设置下拉框选中
                recipientSelect.value = recipientValue;
                recipientInput.classList.add('hidden');
            } else {
                // 如果值不在选项中，设置为"其他"并显示输入框
                recipientSelect.value = 'other';
                recipientInput.classList.remove('hidden');
                recipientInput.value = recipientValue;
            }
        }
    }, 50);
}

// 保存编辑后的付款记录
function saveEditPaymentRecord(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const record = Object.fromEntries(formData);
    
    // 确保金额保留2位小数
    if (record.amount) {
        record.amount = parseFloat(record.amount).toFixed(2);
    }
    
    // 获取所有付款记录
    const paymentRecords = storage.getPaymentRecords();
    
    // 查找并更新记录
    const index = paymentRecords.findIndex(r => r.id === record.id);
    if (index !== -1) {
        paymentRecords[index] = record;
        storage.paymentRecords = paymentRecords;
        
        // 重新渲染表格
        pageController.renderPaymentTable();
        pageController.updateReports();
        
        // 关闭模态框
        closeModal('editPaymentModal');
        
        // 显示成功通知
        pageController.showNotification('付款记录更新成功', 'success');
    } else {
        pageController.showNotification('更新失败，找不到该记录', 'error');
    }
}

// 删除付款记录
function deletePayment(id) {
    if (confirm('确定要删除这条付款记录吗？此操作不可恢复！')) {
        // 获取所有付款记录
        const paymentRecords = storage.getPaymentRecords();
        
        // 过滤掉要删除的记录
        const updatedRecords = paymentRecords.filter(record => record.id !== id);
        
        // 保存更新后的记录
        storage.paymentRecords = updatedRecords;
        
        // 更新分页数据并重新渲染
        paginations.payment.setData(updatedRecords);
        pageController.renderPaymentTable();
        pageController.updateReports();
        
        // 显示成功通知
        pageController.showNotification('付款记录删除成功', 'success');
    }
}

// 点击页面其他地方关闭付款记录订单号建议列表
document.addEventListener('click', function(event) {
    const suggestions = document.getElementById('paymentOrderNoSuggestions');
    const input = document.getElementById('paymentOrderNo');
    
    if (suggestions && !suggestions.contains(event.target) && !input.contains(event.target)) {
        suggestions.classList.add('hidden');
    }
});

// 计算金额
function calculateAmount(inputElement) {
    // 找到当前产品行
    const productRow = inputElement.closest('.product-row');
    if (!productRow) return;
    
    // 获取数量和单价
    const quantityInput = productRow.querySelector('.product-quantity');
    const unitPriceInput = productRow.querySelector('.product-unit-price');
    const amountInput = productRow.querySelector('.product-amount');
    
    if (!quantityInput || !unitPriceInput || !amountInput) return;
    
    // 转换为数字
    const quantity = parseFloat(quantityInput.value) || 0;
    const unitPrice = parseFloat(unitPriceInput.value) || 0;
    
    // 计算金额
    const amount = quantity * unitPrice;
    
    // 更新金额输入框
    amountInput.value = amount.toFixed(2);
    
    // 重新计算总金额
    calculateTotalAmount();
}

// 计算总金额
function calculateTotalAmount() {
    // 查找所有产品行
    const productRows = document.querySelectorAll('.product-row');
    let totalAmount = 0;
    
    // 遍历所有产品行，累加金额
    productRows.forEach(row => {
        const amountInput = row.querySelector('.product-amount');
        if (amountInput) {
            const amount = parseFloat(amountInput.value) || 0;
            totalAmount += amount;
        }
    });
    
    // 更新总金额显示
    const totalAmountElement = document.getElementById('totalAmount');
    if (totalAmountElement) {
        totalAmountElement.textContent = `¥${totalAmount.toFixed(2)}`;
    }
    
    // 检查编辑订单模态框的总金额
    const editTotalAmountElement = document.getElementById('editTotalAmount');
    if (editTotalAmountElement) {
        editTotalAmountElement.textContent = `¥${totalAmount.toFixed(2)}`;
    }
}

// 添加产品行
function addProductRow(containerId = 'productRowsContainer') {
    const newRow = document.createElement('div');
    newRow.className = 'product-row';
    
    newRow.innerHTML = `
        <div class="flex flex-wrap gap-2">
            <div class="form-group relative" style="flex: 1 1 150px; min-width: 150px;">
                <label class="form-label">产品名称 <span class="text-red-500">*</span></label>
                <input type="text" name="productName" class="form-input product-name" required 
                       oninput="filterProducts(this.value, this)" onclick="showProductSuggestions(this)" placeholder="输入产品名称">
                <div class="absolute bg-white border border-gray-300 rounded shadow-lg mt-1 z-10 hidden w-full"></div>
            </div>
            <div class="form-group relative" style="flex: 1 1 150px; min-width: 150px;">
                <label class="form-label">规格</label>
                <input type="text" name="spec" class="form-input product-spec" 
                       oninput="filterSpecs(this.value, this)" onclick="showSpecSuggestions(this)" placeholder="输入产品规格">
                <div class="absolute bg-white border border-gray-300 rounded shadow-lg mt-1 z-10 hidden w-full"></div>
            </div>
            <div class="form-group relative" style="flex: 0 0 150px;">
                <label class="form-label">图号</label>
                <input type="text" name="drawingNo" class="form-input product-drawing-no" 
                       oninput="filterDrawingNos(this.value, this)" onclick="showDrawingNoSuggestions(this)" placeholder="输入产品图号">
                <div class="absolute bg-white border border-gray-300 rounded shadow-lg mt-1 z-10 hidden w-full"></div>
            </div>
            <div class="form-group" style="flex: 0 0 85px;">
                <label class="form-label">电镀</label>
                <select name="plating" class="form-input product-plating">
                    <option value="是" selected>是</option>
                    <option value="否">否</option>
                </select>
            </div>
            <div class="form-group" style="flex: 0 0 105px;">
                <label class="form-label">LOGO</label>
                <select name="logo" class="form-input product-logo">
                    <option value="LONGLI" selected>LONGLI</option>
                    <option value="KBA">KBA</option>
                    <option value="PERM">PERM</option>
                    <option value="EPCCS">EPCCS</option>
                    <option value="INGHOR">INGHOR</option>
                    <option value="CC">CC</option>
                    <option value="J">J</option>
                    <option value="HS">HS</option>
                    <option value="无">无</option>
                </select>
            </div>
            <div class="form-group" style="flex: 0 0 75px;">
                <label class="form-label">单位</label>
                <input type="text" name="unit" class="form-input product-unit" list="unitOptions" placeholder="选择或输入" onchange="saveCustomUnit(this)">
                <datalist id="unitOptions">
                    <option value="只">
                    <option value="个">
                    <option value="套">
                    <option value="箱">
                    <option value="公斤">
                    <option value="吨">
                    <option value="袋">
                </datalist>
            </div>
            <div class="form-group" style="flex: 0 0 115px;">
                <label class="form-label">数量 <span class="text-red-500">*</span></label>
                <input type="number" name="quantity" class="form-input product-quantity" required min="0" step="0.01" placeholder="输入数量" 
                       oninput="calculateAmount(this)">
            </div>
            <div class="form-group" style="flex: 0 0 115px;">
                <label class="form-label">单价 <span class="text-red-500">*</span></label>
                <input type="number" name="unitPrice" class="form-input product-unit-price" required min="0" step="0.01" placeholder="输入单价" 
                       oninput="calculateAmount(this)">
            </div>
            <div class="form-group" style="flex: 0 0 130px;">
                <label class="form-label">金额 <span class="text-red-500">*</span></label>
                <input type="number" name="amount" class="form-input product-amount" readonly min="0" step="0.01" placeholder="自动计算">
            </div>
        </div>
    `;
    
    const container = document.getElementById(containerId);
    if (container) {
        container.appendChild(newRow);
    }
}

// 初始化导航标签事件
function initNavigationTabs() {
    // 为所有导航标签添加点击事件监听器
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            if (tabName) {
                pageController.switchTab(tabName);
            }
        });
    });
}

// 查看客户详情
function viewCustomerDetail(customerId) {
    const customer = storage.getCustomerRecords().find(c => c.id === customerId);
    if (!customer) return;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-800">客户详情 - ${customer.customerName}</h3>
                <button class="text-gray-500 hover:text-gray-700" onclick="this.closest('.fixed').remove()">
                    <i class="fa fa-times text-xl"></i>
                </button>
            </div>
            <div class="p-6 max-h-[80vh] overflow-y-auto">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 class="text-md font-medium text-gray-700 mb-3">基本信息</h4>
                        <div class="space-y-3">
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">客户ID:</span>
                                <span class="text-sm text-gray-900">${customer.id}</span>
                            </div>
                            <div class="flex items-center">
                                <span class="text-sm text-gray-500 w-24">客户名称:</span>
                                <span class="text-sm text-gray-900 font-medium">${customer.customerName}</span>
                                <button class="ml-2 text-gray-500 hover:text-blue-600" title="复制公司名称" onclick="copyToClipboard('${customer.customerName}', '公司名称已复制！')">
                                    <i class="fa fa-copy"></i>
                                </button>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">客户类型:</span>
                                <span class="text-sm text-gray-900">${customer.customerType}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">所在地区:</span>
                                <span class="text-sm text-gray-900">${customer.region}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">联系人:</span>
                                <span class="text-sm text-gray-900">${customer.contactName}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">联系电话:</span>
                                <span class="text-sm text-gray-900">${customer.phone}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">电子邮箱:</span>
                                <span class="text-sm text-gray-900">${customer.email}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">公司网址:</span>
                                <span class="text-sm text-blue-600 hover:underline">${customer.website || ''}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-md font-medium text-gray-700 mb-3">详细信息</h4>
                        <div class="space-y-3">
                            <div>
                                <span class="text-sm text-gray-500 block mb-1">公司地址:</span>
                                <span class="text-sm text-gray-900">${customer.address}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">职位:</span>
                                <span class="text-sm text-gray-900">${customer.contactTitle || ''}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">标签:</span>
                                <div class="flex flex-wrap gap-1 mt-1">
                                    ${customer.tags ? customer.tags.split(',').map(tag => `<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">${tag.trim()}</span>`).join('') : ''}
                                </div>
                            </div>
                            <div>
                                <span class="text-sm text-gray-500 block mb-1">备注:</span>
                                <span class="text-sm text-gray-900">${customer.remark || ''}</span>
                            </div>
                            <div class="flex">
                                <span class="text-sm text-gray-500 w-24">创建日期:</span>
                                <span class="text-sm text-gray-900">${customer.createdAt || '未知'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 编辑客户
function editCustomer(customerId) {
    const customer = storage.getCustomerRecords().find(c => c.id === customerId);
    if (!customer) return;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-800">编辑客户 - ${customer.customerName}</h3>
                <button class="text-gray-500 hover:text-gray-700" onclick="this.closest('.fixed').remove()">
                    <i class="fa fa-times text-xl"></i>
                </button>
            </div>
            <div class="p-6">
                <form onsubmit="saveEditedCustomer(event, '${customerId}')">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">客户名称</label>
                            <input type="text" name="customerName" value="${customer.customerName}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">客户类型</label>
                            <select name="customerType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="客户" ${customer.customerType === '客户' ? 'selected' : ''}>客户</option>
                                <option value="供应商" ${customer.customerType === '供应商' ? 'selected' : ''}>供应商</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">所在地区</label>
                            <input type="text" name="region" value="${customer.region}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                            <input type="text" name="contactName" value="${customer.contactName}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                            <input type="text" name="phone" value="${customer.phone}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
                            <input type="text" name="email" value="${customer.email}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">公司地址</label>
                            <input type="text" name="address" value="${customer.address}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">职位</label>
                            <input type="text" name="contactTitle" value="${customer.contactTitle || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">公司网址</label>
                            <input type="text" name="website" value="${customer.website || ''}" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">标签</label>
                            <input type="text" name="tags" value="${customer.tags || ''}" placeholder="用逗号分隔多个标签" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
                            <textarea name="remark" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${customer.remark || ''}</textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button type="button" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 mr-2" onclick="this.closest('.fixed').remove()">
                            取消
                        </button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700">
                            保存修改
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 保存编辑后的客户信息
function saveEditedCustomer(event, customerId) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const originalCustomer = storage.getCustomerRecords().find(c => c.id === customerId);
    const updatedCustomer = {
        ...originalCustomer,
        customerName: formData.get('customerName'),
        customerType: formData.get('customerType'),
        region: formData.get('region'),
        contactName: formData.get('contactName'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        contactTitle: formData.get('contactTitle'),
        website: formData.get('website'),
        tags: formData.get('tags'),
        remark: formData.get('remark'),
        createdAt: originalCustomer.createdAt || new Date().toISOString().split('T')[0]
    };
    
    const allCustomers = storage.getCustomerRecords();
    const index = allCustomers.findIndex(c => c.id === customerId);
    allCustomers[index] = updatedCustomer;
    
    localStorage.setItem('customerRecords', JSON.stringify(allCustomers));
    paginations.customer.updateData(allCustomers);
    pageController.renderCustomerTable();
    event.target.closest('.fixed').remove();
    alert('客户信息已成功更新');
    updateCountryFilterOptions();
}

// 添加客户
function addCustomer() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-800">添加新客户</h3>
                <button class="text-gray-500 hover:text-gray-700" onclick="this.closest('.fixed').remove()">
                    <i class="fa fa-times text-xl"></i>
                </button>
            </div>
            <div class="p-6">
                <form onsubmit="saveNewCustomer(event)">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">客户名称</label>
                            <input type="text" name="customerName" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">客户类型</label>
                            <select name="customerType" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="客户">客户</option>
                                <option value="供应商">供应商</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">所在地区</label>
                            <input type="text" name="region" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                            <input type="text" name="contactName" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                            <input type="text" name="phone" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">电子邮箱</label>
                            <input type="text" name="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">公司地址</label>
                            <input type="text" name="address" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">职位</label>
                            <input type="text" name="contactTitle" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">公司网址</label>
                            <input type="text" name="website" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">标签</label>
                            <input type="text" name="tags" placeholder="用逗号分隔多个标签" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm font-medium text-gray-700 mb-1">备注</label>
                            <textarea name="remark" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button type="button" class="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 mr-2" onclick="this.closest('.fixed').remove()">
                            取消
                        </button>
                        <button type="submit" class="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700">
                            保存
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}









// 保存新客户
function saveNewCustomer(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const newCustomer = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        customerName: formData.get('customerName'),
        customerType: formData.get('customerType'),
        region: formData.get('region'),
        contactName: formData.get('contactName'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        address: formData.get('address'),
        contactTitle: formData.get('contactTitle'),
        website: formData.get('website'),
        tags: formData.get('tags'),
        remark: formData.get('remark'),
        createdAt: new Date().toISOString().split('T')[0]
    };
    
    const allCustomers = storage.getCustomerRecords();
    allCustomers.push(newCustomer);
    
    localStorage.setItem('customerRecords', JSON.stringify(allCustomers));
    pageController.renderCustomerTable();
    event.target.closest('.fixed').remove();
    alert('新客户已成功添加');
    updateCountryFilterOptions();
}

// 联系客户
function contactCustomer(customerId) {
    const customer = storage.getCustomerRecords().find(c => c.id === customerId);
    if (!customer) return;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div class="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-800">联系信息 - ${customer.customerName}</h3>
                <button class="text-gray-500 hover:text-gray-700 focus:outline-none px-2 py-1 text-xl font-bold" onclick="this.closest('.fixed').remove()">
                    ×
                </button>
            </div>
            <div class="p-6 max-h-[80vh] overflow-y-auto">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">公司名称</label>
                        <p class="text-gray-800 break-words">${customer.customerName || ''}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">联系人</label>
                        <p class="text-gray-800 break-words">${customer.contactName || ''}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">电话</label>
                        <p class="text-gray-800 break-words">${customer.phone || ''}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">邮件地址</label>
                        <p class="text-gray-800 break-words">${customer.email || ''}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 删除客户
function deleteCustomer(customerId) {
    if (confirm('确定要删除这个客户吗？')) {
        const allCustomers = storage.getCustomerRecords();
        const updatedCustomers = allCustomers.filter(c => c.id !== customerId);
        localStorage.setItem('customerRecords', JSON.stringify(updatedCustomers));
        pageController.renderCustomerTable();
    }
}

// 国家中英文对照映射
const countryNameMap = {
    // 欧洲国家
    '德国': 'Germany',
    '法国': 'France',
    '西班牙': 'Spain',
    '意大利': 'Italy',
    '英国': 'United Kingdom',
    '俄罗斯': 'Russia',
    '乌克兰': 'Ukraine',
    '波兰': 'Poland',
    '捷克': 'Czech Republic',
    '斯洛伐克': 'Slovakia',
    '匈牙利': 'Hungary',
    '奥地利': 'Austria',
    '瑞士': 'Switzerland',
    '荷兰': 'Netherlands',
    '比利时': 'Belgium',
    '卢森堡': 'Luxembourg',
    '丹麦': 'Denmark',
    '挪威': 'Norway',
    '瑞典': 'Sweden',
    '芬兰': 'Finland',
    '冰岛': 'Iceland',
    '爱尔兰': 'Ireland',
    '葡萄牙': 'Portugal',
    '希腊': 'Greece',
    '土耳其': 'Turkey',
    '阿尔巴尼亚': 'Albania',
    '白俄罗斯': 'Belarus',
    '保加利亚': 'Bulgaria',
    '克罗地亚': 'Croatia',
    '爱沙尼亚': 'Estonia',
    '格鲁吉亚': 'Georgia',
    '拉脱维亚': 'Latvia',
    '立陶宛': 'Lithuania',
    '马其顿': 'Macedonia',
    '摩尔多瓦': 'Moldova',
    '黑山': 'Montenegro',
    '罗马尼亚': 'Romania',
    '塞尔维亚': 'Serbia',
    '斯洛文尼亚': 'Slovenia',
    // 北美国家
    '美国': 'United States',
    '加拿大': 'Canada',
    '墨西哥': 'Mexico',
    '巴拿马': 'Panama',
    // 南美国家
    '巴西': 'Brazil',
    '阿根廷': 'Argentina',
    '智利': 'Chile',
    '哥伦比亚': 'Colombia',
    '秘鲁': 'Peru',
    '厄瓜多尔': 'Ecuador',
    '委内瑞拉': 'Venezuela',
    '玻利维亚': 'Bolivia',
    '乌拉圭': 'Uruguay',
    '巴拉圭': 'Paraguay',
    // 中东国家
    '以色列': 'Israel',
    '阿联酋': 'United Arab Emirates',
    '沙特阿拉伯': 'Saudi Arabia',
    '伊朗': 'Iran',
    '伊拉克': 'Iraq',
    '叙利亚': 'Syria',
    '约旦': 'Jordan',
    '黎巴嫩': 'Lebanon',
    '科威特': 'Kuwait',
    '卡塔尔': 'Qatar',
    '巴林': 'Bahrain',
    '阿曼': 'Oman',
    '也门': 'Yemen',
    // 南亚国家
    '印度': 'India',
    '巴基斯坦': 'Pakistan',
    '孟加拉国': 'Bangladesh',
    '斯里兰卡': 'Sri Lanka',
    '尼泊尔': 'Nepal',
    '不丹': 'Bhutan',
    '马尔代夫': 'Maldives',
    // 东南亚国家
    '泰国': 'Thailand',
    '越南': 'Vietnam',
    '马来西亚': 'Malaysia',
    '印度尼西亚': 'Indonesia',
    '菲律宾': 'Philippines',
    '新加坡': 'Singapore',
    '柬埔寨': 'Cambodia',
    '老挝': 'Laos',
    '缅甸': 'Myanmar',
    '文莱': 'Brunei',
    // 东亚国家
    '韩国': 'South Korea',
    '日本': 'Japan',
    '中国': 'China',
    // 大洋洲国家
    '澳大利亚': 'Australia',
    '新西兰': 'New Zealand',
    // 非洲国家
    '南非': 'South Africa',
    '尼日利亚': 'Nigeria',
    '肯尼亚': 'Kenya',
    '埃及': 'Egypt',
    '摩洛哥': 'Morocco',
    '阿尔及利亚': 'Algeria',
    '突尼斯': 'Tunisia',
    '利比亚': 'Libya',
    '多哥': 'Togo',
    '马达加斯加': 'Madagascar',
    // 地区（非国家）
    '台湾': 'Taiwan',
    '香港': 'Hong Kong',
    '澳门': 'Macau',
    // 简写形式
    '印尼': 'Indonesia',
    '孟加拉': 'Bangladesh',
    '马约特': 'Mayotte',
    '伊朗': 'Iran',
    '叙利亚': 'Syria'
};

// 全局变量存储所有国家数据
let allCountriesData = [];

// 获取国家的英文名称
function getCountryEnglishName(chineseName) {
    // 检查是否是组合值（如"台湾/越南"）
    if (chineseName.includes('/')) {
        const parts = chineseName.split('/');
        const englishParts = parts.map(part => countryNameMap[part.trim()] || part.trim());
        return englishParts.join('/');
    }
    return countryNameMap[chineseName] || chineseName;
}

// 初始化国家搜索功能
function initCountrySearch() {
    const searchInput = document.getElementById('country-search-input');
    const countryFilter = document.getElementById('country-filter');
    
    if (!searchInput || !countryFilter) return;
    
    // 获取所有客户记录并提取国家
    const allCustomers = storage.getCustomerRecords();
    const countries = [...new Set(allCustomers.map(customer => customer.region?.trim()).filter(Boolean))];
    
    // 按英文名称首字母排序
    countries.sort((a, b) => {
        const englishA = getCountryEnglishName(a).toLowerCase();
        const englishB = getCountryEnglishName(b).toLowerCase();
        return englishA.localeCompare(englishB);
    });
    
    // 保存所有国家数据（用于搜索）
    allCountriesData = countries.map(country => ({
        chinese: country,
        english: getCountryEnglishName(country)
    }));
    
    // 清除现有选项（保留第一个"所有国家"选项）
    const allOption = countryFilter.querySelector('option[value="all"]') || countryFilter.firstElementChild;
    countryFilter.innerHTML = '';
    countryFilter.appendChild(allOption);
    
    // 添加国家选项（显示格式：英文名称 - 中文名称）
    countries.forEach(country => {
        const englishName = getCountryEnglishName(country);
        const option = document.createElement('option');
        option.value = country;
        option.textContent = `${englishName} - ${country}`;
        countryFilter.appendChild(option);
    });
    
    // 绑定搜索事件
    searchInput.addEventListener('input', function() {
        const keyword = this.value.toLowerCase().trim();
        
        // 保留"所有国家"选项
        const allOption = countryFilter.querySelector('option[value="all"]') || countryFilter.firstElementChild;
        countryFilter.innerHTML = '';
        countryFilter.appendChild(allOption);
        
        if (!keyword) {
            // 如果没有搜索关键字，显示所有国家
            allCountriesData.forEach(item => {
                const option = document.createElement('option');
                option.value = item.chinese;
                option.textContent = `${item.english} - ${item.chinese}`;
                countryFilter.appendChild(option);
            });
        } else {
            // 根据关键字筛选（支持中英文搜索）
            const filteredCountries = allCountriesData.filter(item => 
                item.chinese.toLowerCase().includes(keyword) || 
                item.english.toLowerCase().includes(keyword)
            );
            
            filteredCountries.forEach(item => {
                const option = document.createElement('option');
                option.value = item.chinese;
                option.textContent = `${item.english} - ${item.chinese}`;
                countryFilter.appendChild(option);
            });
        }
    });
}

// 修复所有国家下拉框，动态提取唯一国家名并按英文首字母排序
function updateCountryFilterOptions() {
    // 直接调用 initCountrySearch 来初始化国家筛选和搜索功能
    initCountrySearch();
}

// 导出客户名片为PDF
function exportCustomerCards() {
    const countryFilter = document.getElementById('country-filter');
    const selectedCountry = countryFilter.value;
    
    let filteredCustomers = storage.getCustomerRecords();
    if (selectedCountry !== 'all') {
        filteredCustomers = filteredCustomers.filter(c => c.region === selectedCountry);
    }
    
    if (filteredCustomers.length === 0) {
        alert('没有找到匹配的客户');
        return;
    }
    
    // 创建临时容器用于生成客户卡片
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.top = '-9999px';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = '800px';
    tempContainer.style.padding = '20px';
    tempContainer.style.backgroundColor = '#ffffff';
    document.body.appendChild(tempContainer);
    
    // 生成所有客户卡片HTML
    filteredCustomers.forEach(customer => {
        const card = document.createElement('div');
        card.className = 'customer-card';
        card.style.width = '760px';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '8px';
        card.style.padding = '20px';
        card.style.marginBottom = '20px';
        card.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
        card.style.fontFamily = 'Microsoft YaHei, Arial, sans-serif';
        card.style.wordWrap = 'break-word';
        card.style.overflow = 'hidden';
        
        let cardHTML = `
            <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: bold; color: #2d3748;">${customer.customerName || '未命名客户'}</h3>
            <div style="font-size: 14px; line-height: 1.8; color: #4a5568;">
        `;
        
        if (customer.customerType) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>类型:</strong> ' + customer.customerType + '</p>';
        }
        
        if (customer.region) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>地区:</strong> ' + customer.region + '</p>';
        }
        
        if (customer.contactName) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>联系人:</strong> ' + customer.contactName + '</p>';
        }
        
        if (customer.phone) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>电话:</strong> ' + customer.phone + '</p>';
        }
        
        if (customer.email) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>邮箱:</strong> ' + customer.email + '</p>';
        }
        
        if (customer.address) {
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>地址:</strong> ' + customer.address + '</p>';
        }
        
        if (customer.tags) {
            const tags = customer.tags.split(',').map(tag => tag.trim()).join(', ');
            cardHTML += '<p style="margin: 0 0 8px 0;"><strong>标签:</strong> ' + tags + '</p>';
        }
        
        const createdAt = customer.createdAt || '未知';
        cardHTML += '<p style="margin: 10px 0 0 0; font-size: 12px; color: #718096;"><strong>创建日期:</strong> ' + createdAt + '</p>';
        
        cardHTML += '</div>';
        card.innerHTML = cardHTML;
        tempContainer.appendChild(card);
    });
    
    // 使用html2canvas和jsPDF生成PDF
    html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: tempContainer.offsetWidth,
        height: tempContainer.offsetHeight
    }).then(canvas => {
        // 将canvas转换为图片
        const imgData = canvas.toDataURL('image/png');
        
        // 创建PDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // 计算PDF页面尺寸和图片尺寸
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        
        // 计算图片在PDF中的位置和尺寸
        const imgX = (pdfWidth - imgWidth * ratio) / 2;
        let imgY = 0;
        const imgWidthInPdf = imgWidth * ratio;
        const imgHeightInPdf = imgHeight * ratio;
        
        // 如果图片高度超过单页，需要分页
        let heightLeft = imgHeightInPdf;
        
        while (heightLeft > 0) {
            // 添加图片到PDF
            pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidthInPdf, Math.min(imgHeightInPdf, pdfHeight));
            
            // 减少剩余高度
            heightLeft -= pdfHeight;
            
            // 如果还有剩余，添加新页面
            if (heightLeft > 0) {
                pdf.addPage();
                imgY = -heightLeft;
            }
        }
        
        // 下载PDF
        pdf.save('客户名片汇总_' + (selectedCountry === 'all' ? '所有国家' : selectedCountry) + '.pdf');
        alert('已成功导出' + filteredCustomers.length + '个客户名片到PDF文件中！');
        
        // 清理临时容器
        document.body.removeChild(tempContainer);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('export-customer-cards');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportCustomerCards);
    }
    
    // 绑定添加客户按钮事件
    const addCustomerBtn = document.getElementById('add-customer-btn');
    if (addCustomerBtn) {
        addCustomerBtn.addEventListener('click', addCustomer);
    }
    
    // 初始化年份筛选下拉框（从2020年开始往后15年）
    const yearFilter = document.getElementById('year-filter');
    if (yearFilter) {
        const startYear = 2020;
        const endYear = startYear + 15;
        for (let year = startYear; year <= endYear; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year + '年';
            yearFilter.appendChild(option);
        }
    }
    
    // 绑定国家筛选下拉框事件
    const countryFilter = document.getElementById('country-filter');
    if (countryFilter) {
        countryFilter.addEventListener('change', function() {
            filterCustomersByCountry(this.value);
        });
    }
    
    // 绑定年份筛选下拉框事件
    if (yearFilter) {
        yearFilter.addEventListener('change', function() {
            const countryFilterValue = document.getElementById('country-filter').value;
            filterCustomersByCountry(countryFilterValue);
        });
    }
    
    // 绑定优先级筛选下拉框事件
    const priorityFilter = document.getElementById('priority-filter');
    if (priorityFilter) {
        priorityFilter.addEventListener('change', function() {
            const countryFilterValue = document.getElementById('country-filter').value;
            filterCustomersByCountry(countryFilterValue);
        });
    }
    
    // 绑定优先级五角星点击事件
    bindPriorityStarEvents();
});

// 绑定优先级五角星点击事件
function bindPriorityStarEvents() {
    document.querySelectorAll('.priority-star').forEach(button => {
        button.addEventListener('click', function() {
            const customerId = this.getAttribute('data-id');
            const icon = this.querySelector('i');
            const isPriority = icon.classList.contains('fa-star');
            
            // 切换优先级状态
            if (isPriority) {
                icon.classList.remove('fa-star');
                icon.classList.add('fa-star-o');
                this.style.color = '';
                updateCustomerPriority(customerId, false);
            } else {
                icon.classList.remove('fa-star-o');
                icon.classList.add('fa-star');
                this.style.color = '#dc2626';
                updateCustomerPriority(customerId, true);
            }
        });
    });
}

// 更新客户优先级
function updateCustomerPriority(customerId, isPriority) {
    const allCustomers = storage.customerRecords;
    const customer = allCustomers.find(c => c.id === customerId);
    if (customer) {
        customer.priority = isPriority;
        storage.customerRecords = allCustomers;
        
        // 如果有优先级筛选，更新显示
        const priorityFilter = document.getElementById('priority-filter');
        if (priorityFilter && priorityFilter.value !== 'all') {
            const countryFilterValue = document.getElementById('country-filter').value;
            filterCustomersByCountry(countryFilterValue);
        }
    }
}

// 根据国家筛选客户
function filterCustomersByCountry(country) {
    let filteredCustomers = storage.getCustomerRecords();
    
    // 应用国家筛选
    if (country !== 'all') {
        filteredCustomers = filteredCustomers.filter(c => c.region === country);
    }
    
    // 应用搜索过滤
    const searchInput = document.getElementById('customer-search-input');
    if (searchInput && searchInput.value.trim() !== '') {
        const searchTerm = searchInput.value.trim().toLowerCase();
        filteredCustomers = filteredCustomers.filter(c => 
            (c.customerName && c.customerName.toLowerCase().includes(searchTerm)) ||
            (c.contactName && c.contactName.toLowerCase().includes(searchTerm)) ||
            (c.email && c.email.toLowerCase().includes(searchTerm)) ||
            (c.phone && String(c.phone).toLowerCase().includes(searchTerm)) ||
            (c.remark && c.remark.toLowerCase().includes(searchTerm))
        );
    }
    
    // 应用标签过滤
    const tagContainer = document.getElementById('customer-group-tags');
    if (tagContainer) {
        // 找到当前激活的标签（带有bg-blue-700类的标签）
        const activeTag = tagContainer.querySelector('button.bg-blue-700');
        if (activeTag) {
            const filterType = activeTag.getAttribute('data-filter');
            if (filterType === 'customer') {
                filteredCustomers = filteredCustomers.filter(c => c.customerType === '客户');
            } else if (filterType === 'supplier') {
                filteredCustomers = filteredCustomers.filter(c => c.customerType === '供应商');
            }
        } else {
            // 如果没有激活的标签，检查是否有默认的激活状态
            const allTag = tagContainer.querySelector('button[data-filter="all"]');
            if (allTag) {
                // 全部标签是默认激活的，不需要进一步过滤
            }
        }
    }
    
    // 应用优先级筛选
    const priorityFilter = document.getElementById('priority-filter');
    if (priorityFilter) {
        const priorityValue = priorityFilter.value;
        if (priorityValue === 'priority') {
            filteredCustomers = filteredCustomers.filter(c => c.priority);
        } else if (priorityValue === 'normal') {
            filteredCustomers = filteredCustomers.filter(c => !c.priority);
        }
    }
    
    // 应用年份筛选
    const yearFilter = document.getElementById('year-filter');
    if (yearFilter) {
        const yearValue = yearFilter.value;
        if (yearValue !== 'all') {
            filteredCustomers = filteredCustomers.filter(c => {
                if (!c.createdAt) return false;
                const createdAtYear = new Date(c.createdAt).getFullYear();
                return createdAtYear === parseInt(yearValue);
            });
        }
    }
    
    // 更新显示
    pageController.renderCustomerTable(filteredCustomers);
}

// 生成生产通知单
function generateProductionNotice() {
    // 获取所有选中的订单ID（支持跨页选中）
    const selectedOrderIds = getSelectedOrderIds();

    if (selectedOrderIds.length === 0) {
        alert('请先选择要生成生产通知单的订单');
        return;
    }

    // 获取所有订单记录
    const allOrders = storage.getOrderRecords();

    // 筛选出选中的订单
    const selectedOrders = allOrders.filter(order => selectedOrderIds.includes(order.id));

    // 构建URL参数
    const params = new URLSearchParams();
    
    // 提取日期函数
    function extractDate(dateString) {
        if (!dateString) return '';
        
        // 确保dateString是字符串类型
        const dateStr = String(dateString);
        
        // 如果包含时间部分，只取日期部分
        if (dateStr.includes('T')) {
            return dateStr.split('T')[0];
        }
        // 如果是完整的日期时间格式，只取前10个字符
        if (dateStr.length > 10) {
            return dateStr.substring(0, 10);
        }
        return dateStr;
    }
    
    // 设置订单基本信息
    if (selectedOrders.length > 0) {
        // 收集所有订单号，用逗号分隔
        const orderNumbers = selectedOrders.map(order => order.orderNo || '').filter(Boolean);
        params.set('orderNo', orderNumbers.join(','));
        
        // 获取第一个订单的日期和客户信息
        const firstOrder = selectedOrders[0];
        params.set('orderDate', extractDate(firstOrder.orderDate || ''));
        params.set('deliveryDate', extractDate(firstOrder.deliveryDate || ''));
        params.set('customer', firstOrder.customer || '');
    }
    
    // 设置产品信息
    selectedOrders.forEach((order, index) => {
        params.set(`product${index + 1}`, order.productName || '');
        params.set(`spec${index + 1}`, order.spec || '');
        params.set(`drawing${index + 1}`, order.drawingNo || '');
        params.set(`plated${index + 1}`, order.plating || '');
        params.set(`bow${index + 1}`, order.logo || '');
        params.set(`quantity${index + 1}`, order.quantity || '');
        params.set(`remark${index + 1}`, order.remark || '');
    });
    
    // 打开生产通知单页面
window.open(`生产通知单.html?${params.toString()}`, '_blank');
}

// 生成订单箱唛
// 传递到merged_order_labels.html文件中的字段对应关系是：订单号与PO, 数量和Total (TTL)，图号和Remarks，客户与Company Name
function generateOrderLabels() {
    // 获取所有选中的订单（支持跨页选中）
    const selectedOrderIds = getSelectedOrderIds();

    if (selectedOrderIds.length === 0) {
        alert('请先选择要生成箱唛的订单');
        return;
    }

    // 根据ID获取订单数据
    const allOrders = storage.getOrderRecords();
    const selectedOrders = allOrders.filter(order => selectedOrderIds.includes(order.id));

    // 允许选择多条，但必须属同一订单号
    const firstOrderNo = selectedOrders[0].orderNo;
    if (!selectedOrders.every(o => o.orderNo === firstOrderNo)) {
        alert('只能选择同一订单号的记录生成箱唛，请返回重新选择');
        return;
    }

    // 获取该订单号下的全部记录（用于计算每条记录对应的 A/B/C 后缀位置）
    const sameOrderRecords = allOrders.filter(o => o.orderNo === firstOrderNo);

    // 构建URL参数
    const params = new URLSearchParams();

    // 按用户勾选顺序传递每条记录
    selectedOrders.forEach((productLine, index) => {
        // 后缀 = 该记录在同一订单号全部记录中的位置（0→A, 1→B, 2→C...）
        const posInOrder = sameOrderRecords.findIndex(o => o.id === productLine.id);
        const suffix = String.fromCharCode(65 + posInOrder);
        // 构建带后缀的PO号
        const poWithSuffix = `${productLine.orderNo}${suffix}`;

        // 设置订单字段
        params.set(`po${index + 1}`, poWithSuffix); // 带后缀的订单号对应PO
        params.set(`ttl${index + 1}`, productLine.quantity || ''); // 数量对应Total(TTL)
        params.set(`remarks${index + 1}`, productLine.drawingNo || ''); // 图号对应Remarks
        params.set(`company${index + 1}`, productLine.customer || ''); // 客户对应Company Name
    });
    
    // 打开箱唛页面
    window.open(`merged_order_labels.html?${params.toString()}`, '_blank');
}

// 导入出口记录Excel
function importExportExcel() {
    // 创建文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls, .csv';
    fileInput.style.display = 'none';
    
    fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 检查文件类型
        const fileType = file.name.split('.').pop().toLowerCase();
        const validTypes = ['xlsx', 'xls', 'csv'];
        if (!validTypes.includes(fileType)) {
            pageController.showNotification('不支持的文件类型，请选择.xlsx、.xls或.csv文件', 'error');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                let workbook;
                
                // 根据文件类型选择不同的读取方式
                if (fileType === 'csv') {
                    // 处理CSV文件
                    const text = event.target.result;
                    workbook = XLSX.read(text, { type: 'string' });
                } else {
                    // 处理Excel文件
                    const data = new Uint8Array(event.target.result);
                    workbook = XLSX.read(data, { type: 'array' });
                }
                
                if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('无效的Excel文件，无法读取工作表');
                }
                
                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!worksheet) {
                    throw new Error('无法读取工作表数据');
                }
                
                // 将工作表转换为JSON数据
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    range: 1
                });
                
                // 检查是否有数据
                if (jsonData.length === 0 || !jsonData[0]) {
                    throw new Error('Excel文件中没有数据');
                }
                
                // 处理导入的数据
                const importedRecords = [];
                
                // 遍历数据行
                jsonData.forEach((row, index) => {
                    // 跳过空行
                    if (!row || row.every(cell => cell === undefined || cell === null || cell === '')) {
                        return;
                    }
                    
                    // 按照出口管理表格表头顺序：状态,出货日期,到港日期,客户,订单号,运编号,船名航次,集装箱号封号,提单号,报关金额,备注
                    const record = {
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                        status: row[0] || '',
                        exportDate: row[1] || '',
                        arrivalDate: row[2] || '',
                        customer: row[3] || '',
                        orderNo: row[4] || '',
                        shipmentNo: row[5] || '',
                        vesselVoyage: row[6] || '',
                        containerSeal: row[7] || '',
                        billNo: row[8] || '',
                        declarationAmount: row[9] ? parseFloat(row[9]).toFixed(2) : '',
                        remark: row[10] || ''
                    };
                    
                    importedRecords.push(record);
                });
                
                // 检查是否有有效的记录
                if (importedRecords.length === 0) {
                    throw new Error('没有有效的出口记录可导入');
                }
                
                // 保存到localStorage
                const currentRecords = storage.getExportRecords();
                const updatedRecords = [...currentRecords, ...importedRecords];
                storage.exportRecords = updatedRecords;

                // 更新表格
                pageController.renderExportTable();
                
                // 显示成功提示
                pageController.showNotification('出口记录导入成功！导入了 ' + importedRecords.length + ' 条记录', 'success');
            } catch (error) {
                console.error('Excel解析失败:', error);
                let errorMsg = 'Excel解析失败，请检查文件格式！';
                errorMsg += ' 错误信息：' + error.message;
                pageController.showNotification(errorMsg, 'error');
            }
        };
        
        // 根据文件类型选择不同的读取方式
        if (fileType === 'csv') {
            reader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsArrayBuffer(file);
        }
    };
    
    // 触发文件选择对话框
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// 导出出口记录Excel
function exportExportExcel() {
    // 获取所有出口记录
    const records = storage.getExportRecords();
    
    // 按出货日期倒序排序
    const sortedRecords = [...records].sort((a, b) => {
        const dateA = new Date(a.exportDate || '1970-01-01');
        const dateB = new Date(b.exportDate || '1970-01-01');
        return dateB - dateA;
    });
    
    // 准备导出数据
    const exportData = sortedRecords.map(record => {
        return {
            '状态': record.status || '',
            '出货日期': record.exportDate || '',
            '到港日期': record.arrivalDate || '',
            '客户': record.customer || '',
            '订单号': record.orderNo || '',
            '运编号': record.shippingNo || record.shipmentNo || '',
            '船名航次': record.shipName || record.vesselVoyage || '',
            '集装箱号封号': record.containerNo || record.containerSeal || '',
            '提单号': record.billNo || '',
            '报关金额': record.declarationAmount || '',
            '备注': record.remark || ''
        };
    });
    
    // 汇总各列数据
    const summary = {
        '状态': '合计',
        '出货日期': '共 ' + sortedRecords.length + ' 条',
        '到港日期': '',
        '客户': '',
        '订单号': '',
        '运编号': '',
        '船名航次': '',
        '集装箱号封号': '',
        '提单号': '',
        '报关金额': sortedRecords.reduce((sum, r) => sum + (parseFloat(r.declarationAmount) || 0), 0).toFixed(2),
        '备注': ''
    };
    exportData.push(summary);
    
    // 创建工作表，使用header选项指定列顺序，与页面表格保持一致
    const worksheet = XLSX.utils.json_to_sheet(exportData, { 
        header: [
            '状态',
            '出货日期',
            '到港日期',
            '客户',
            '订单号',
            '运编号',
            '船名航次',
            '集装箱号封号',
            '提单号',
            '报关金额',
            '备注'
        ]
    });
    
    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '出口记录');
    
    // 导出文件
    XLSX.writeFile(workbook, '出口记录_' + new Date().toISOString().split('T')[0] + '.xlsx');
    
    // 显示成功提示
    pageController.showNotification('出口记录导出成功！共 ' + sortedRecords.length + ' 条记录', 'success');
}

// 导出客户记录Excel
function exportCustomersToExcel() {
    try {
        // 获取所有客户记录
        const customerRecords = storage.getCustomerRecords();

        // 准备导出数据
        const exportData = customerRecords.map(record => ({
            '客户名称': record.customerName || '',
            '客户类型': record.customerType || '',
            '地区': record.region || '',
            '联系人': record.contactName || '',
            '职位': record.contactTitle || '',
            '电话': record.phone || '',
            '邮箱': record.email || '',
            '地址': record.address || '',
            '网站': record.website || '',
            '标签': record.tags || '',
            '备注': record.remark || '',
            '创建日期': record.createdAt || ''
        }));

        // 创建工作表
        const worksheet = XLSX.utils.json_to_sheet(exportData, {
            header: [
                '客户名称',
                '客户类型',
                '地区',
                '联系人',
                '职位',
                '电话',
                '邮箱',
                '地址',
                '网站',
                '标签',
                '备注',
                '创建日期'
            ]
        });

        // 创建工作簿
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '客户记录');

        // 导出文件
        const fileName = '客户记录_' + new Date().toISOString().split('T')[0] + '.xlsx';
        XLSX.writeFile(workbook, fileName);

        // 显示成功提示
        pageController.showNotification('客户记录导出成功！', 'success');
    } catch (error) {
        console.error('Excel导出失败:', error);
        pageController.showNotification('Excel导出失败，请重试！错误信息：' + error.message, 'error');
    }
}

// 备忘录功能实现

// 备忘录可用颜色
const MEMO_COLORS = [
    { name: '默认', value: '#ffffff', border: '#e5e7eb' },
    { name: '黄色', value: '#fef9c3', border: '#fde047' },
    { name: '绿色', value: '#dcfce7', border: '#86efac' },
    { name: '蓝色', value: '#dbeafe', border: '#93c5fd' },
    { name: '粉色', value: '#fce7f3', border: '#f9a8d4' },
    { name: '紫色', value: '#f3e8ff', border: '#d8b4fe' }
];

// 初始化备忘录模块
function initMemoTab() {
    renderMemoList();
}

// 渲染备忘录列表
function renderMemoList(searchTerm = '') {
    const memos = storage.getMemoRecords();
    const filteredMemos = searchTerm ? memos.filter(memo =>
        (memo.title && memo.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (memo.content && memo.content.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : memos;

    // 排序：置顶在前，然后按更新时间倒序
    filteredMemos.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });

    const memoList = document.getElementById('memoList');
    if (!memoList) return;
    memoList.innerHTML = '';

    if (filteredMemos.length === 0) {
        memoList.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <i class="fa fa-sticky-note text-5xl mb-3 opacity-40"></i>
                <p class="text-lg">${searchTerm ? '未找到匹配的备忘录' : '暂无备忘录，点击右上角"添加备忘录"开始'}</p>
            </div>
        `;
        return;
    }

    // 卡片网格容器
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-2';

    filteredMemos.forEach((memo, index) => {
        const card = createMemoCard(memo, index);
        grid.appendChild(card);
    });

    memoList.appendChild(grid);
}

// 创建单条备忘录卡片
function createMemoCard(memo, index) {
    const colorObj = MEMO_COLORS.find(c => c.value === memo.color) || MEMO_COLORS[0];
    const isPinned = memo.pinned;

    const card = document.createElement('div');
    card.className = 'rounded-lg shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col';
    card.style.backgroundColor = colorObj.value;
    card.style.borderLeft = `4px solid ${colorObj.border}`;
    card.dataset.memoId = memo.id;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-2 gap-2">
            <div class="flex items-center min-w-0 flex-1">
                ${isPinned ? '<i class="fa fa-thumb-tack text-orange-500 mr-2 flex-shrink-0" title="已置顶"></i>' : ''}
                <h3 class="text-base font-semibold text-gray-800 truncate memo-title-text">${escapeHtml(memo.title || '无标题')}</h3>
            </div>
            <div class="flex gap-1 flex-shrink-0">
                <button class="memo-pin-btn w-7 h-7 flex items-center justify-center rounded hover:bg-black/10 transition-colors ${isPinned ? 'text-orange-500' : 'text-gray-400'}" title="${isPinned ? '取消置顶' : '置顶'}">
                    <i class="fa fa-thumb-tack text-sm"></i>
                </button>
                <button class="memo-edit-btn w-7 h-7 flex items-center justify-center rounded hover:bg-blue-100 hover:text-blue-600 text-gray-400 transition-colors" title="编辑">
                    <i class="fa fa-pencil text-sm"></i>
                </button>
                <button class="memo-delete-btn w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 hover:text-red-600 text-gray-400 transition-colors" title="删除">
                    <i class="fa fa-trash text-sm"></i>
                </button>
            </div>
        </div>
        <div class="text-sm text-gray-700 whitespace-pre-wrap break-words flex-1 memo-content-text mb-2 max-h-40 overflow-y-auto">${escapeHtml(memo.content || '')}</div>
        <div class="text-xs text-gray-400 flex justify-between items-center mt-2 pt-2 border-t border-black/5">
            <span>${memo.updatedAt ? '更新: ' + memo.updatedAt : '创建: ' + (memo.createdAt || '')}</span>
            <span class="w-3 h-3 rounded-full inline-block" style="background-color:${colorObj.border}" title="${colorObj.name}"></span>
        </div>
    `;

    // 绑定事件
    card.querySelector('.memo-pin-btn').addEventListener('click', () => togglePinMemo(memo.id));
    card.querySelector('.memo-edit-btn').addEventListener('click', () => enterMemoEditMode(card, memo));
    card.querySelector('.memo-delete-btn').addEventListener('click', () => deleteMemo(memo.id));

    return card;
}

// 进入编辑模式
function enterMemoEditMode(card, memo) {
    const colorObj = MEMO_COLORS.find(c => c.value === memo.color) || MEMO_COLORS[0];

    card.innerHTML = `
        <div class="flex justify-between items-center mb-2">
            <input type="text" class="memo-edit-title w-full px-2 py-1 border border-gray-300 rounded text-base font-semibold focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" value="${escapeHtml(memo.title || '')}" placeholder="标题">
        </div>
        <textarea class="memo-edit-content w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none resize-y min-h-[100px] flex-1" placeholder="内容...">${escapeHtml(memo.content || '')}</textarea>
        <div class="flex items-center gap-1 mt-2 flex-wrap">
            <span class="text-xs text-gray-500 mr-1">颜色:</span>
            ${MEMO_COLORS.map(c => `<button type="button" class="memo-color-btn w-5 h-5 rounded-full border-2 ${memo.color === c.value ? 'border-gray-700' : 'border-white'}" style="background-color:${c.border}" data-color="${c.value}" title="${c.name}"></button>`).join('')}
        </div>
        <div class="flex justify-end gap-2 mt-3">
            <button class="memo-cancel-btn px-3 py-1 text-sm rounded bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors">
                <i class="fa fa-times mr-1"></i>取消
            </button>
            <button class="memo-save-btn px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                <i class="fa fa-check mr-1"></i>保存
            </button>
        </div>
    `;

    const titleInput = card.querySelector('.memo-edit-title');
    const contentInput = card.querySelector('.memo-edit-content');
    let selectedColor = memo.color || MEMO_COLORS[0].value;

    titleInput.focus();
    titleInput.select();

    // 颜色选择
    card.querySelectorAll('.memo-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedColor = btn.dataset.color;
            card.querySelectorAll('.memo-color-btn').forEach(b => b.classList.replace('border-gray-700', 'border-white'));
            btn.classList.replace('border-white', 'border-gray-700');
        });
    });

    // 保存
    const saveBtn = card.querySelector('.memo-save-btn');
    const cancelBtn = card.querySelector('.memo-cancel-btn');

    const doSave = () => {
        const newTitle = titleInput.value.trim() || '无标题';
        const newContent = contentInput.value.trim();
        saveMemoEdit(memo.id, newTitle, newContent, selectedColor);
    };

    saveBtn.addEventListener('click', doSave);

    // Ctrl+Enter 保存
    contentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            doSave();
        }
    });

    // Esc 取消
    titleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') renderMemoList(document.getElementById('memoSearch')?.value || '');
    });
    contentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') renderMemoList(document.getElementById('memoSearch')?.value || '');
    });

    cancelBtn.addEventListener('click', () => {
        renderMemoList(document.getElementById('memoSearch')?.value || '');
    });
}

// 切换置顶状态
function togglePinMemo(id) {
    const memos = storage.getMemoRecords();
    const idx = memos.findIndex(m => m.id === id);
    if (idx !== -1) {
        memos[idx].pinned = !memos[idx].pinned;
        memos[idx].updatedAt = new Date().toLocaleString('zh-CN');
        storage.memoRecords = memos;
        renderMemoList(document.getElementById('memoSearch')?.value || '');
    }
}

// 添加备忘录
function addMemo() {
    const newMemo = {
        id: Date.now().toString(),
        title: '',
        content: '',
        color: MEMO_COLORS[0].value,
        pinned: false,
        createdAt: new Date().toLocaleString('zh-CN'),
        updatedAt: new Date().toLocaleString('zh-CN')
    };

    const memos = storage.getMemoRecords();
    memos.push(newMemo);
    storage.memoRecords = memos;

    renderMemoList();

    // 自动进入编辑模式
    setTimeout(() => {
        const card = document.querySelector(`[data-memo-id="${newMemo.id}"]`);
        if (card) {
            enterMemoEditMode(card, newMemo);
        }
    }, 50);
}

// 删除备忘录
function deleteMemo(id) {
    if (confirm('确定要删除这条备忘录吗？')) {
        const memos = storage.getMemoRecords();
        const updatedMemos = memos.filter(memo => memo.id !== id);
        storage.memoRecords = updatedMemos;
        renderMemoList(document.getElementById('memoSearch')?.value || '');
    }
}

// 保存备忘录编辑
function saveMemoEdit(id, title, content, color) {
    const memos = storage.getMemoRecords();
    const memoIndex = memos.findIndex(memo => memo.id === id);

    if (memoIndex !== -1) {
        memos[memoIndex].title = title;
        memos[memoIndex].content = content;
        memos[memoIndex].color = color || memos[memoIndex].color;
        memos[memoIndex].updatedAt = new Date().toLocaleString('zh-CN');
        storage.memoRecords = memos;
    }

    renderMemoList(document.getElementById('memoSearch')?.value || '');
}

// 搜索备忘录
function searchMemos() {
    const searchTerm = document.getElementById('memoSearch').value;
    renderMemoList(searchTerm);
}

// HTML转义，防止XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 业务跟踪模块 ====================

// 业务跟踪自动完成功能
function setupBusinessAutocomplete() {
    const customerNameInput = document.getElementById('businessCustomerName');
    const contactInput = document.getElementById('businessContact');
    const customerNameDropdown = document.getElementById('businessCustomerNameDropdown');
    const contactDropdown = document.getElementById('businessContactDropdown');
    
    if (customerNameInput && customerNameDropdown) {
        customerNameInput.addEventListener('input', function() {
            const value = this.value.trim().toLowerCase();
            if (!value) {
                customerNameDropdown.classList.add('hidden');
                return;
            }
            
            const customers = storage.getCustomerRecords().filter(c => 
                (c.customerName && c.customerName.toLowerCase().includes(value)) ||
                (c.contactName && c.contactName.toLowerCase().includes(value))
            );
            
            if (customers.length > 0) {
                renderBusinessAutocompleteDropdown(customerNameDropdown, customers, 'customerName');
                customerNameDropdown.classList.remove('hidden');
            } else {
                customerNameDropdown.classList.add('hidden');
            }
        });
        
        customerNameInput.addEventListener('focus', function() {
            if (this.value.trim()) {
                const event = new Event('input');
                this.dispatchEvent(event);
            }
        });
    }
    
    if (contactInput && contactDropdown) {
        contactInput.addEventListener('input', function() {
            const value = this.value.trim().toLowerCase();
            if (!value) {
                contactDropdown.classList.add('hidden');
                return;
            }
            
            const customers = storage.getCustomerRecords().filter(c => 
                (c.contactName && c.contactName.toLowerCase().includes(value)) ||
                (c.customerName && c.customerName.toLowerCase().includes(value))
            );
            
            if (customers.length > 0) {
                renderBusinessAutocompleteDropdown(contactDropdown, customers, 'contactName');
                contactDropdown.classList.remove('hidden');
            } else {
                contactDropdown.classList.add('hidden');
            }
        });
        
        contactInput.addEventListener('focus', function() {
            if (this.value.trim()) {
                const event = new Event('input');
                this.dispatchEvent(event);
            }
        });
    }
    
    document.addEventListener('click', function(e) {
        if (!customerNameInput?.contains(e.target) && !customerNameDropdown?.contains(e.target)) {
            customerNameDropdown?.classList.add('hidden');
        }
        if (!contactInput?.contains(e.target) && !contactDropdown?.contains(e.target)) {
            contactDropdown?.classList.add('hidden');
        }
    });
}

function renderBusinessAutocompleteDropdown(dropdown, customers, primaryField) {
    dropdown.innerHTML = customers.map(customer => `
        <div class="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0" data-customer='${JSON.stringify(customer).replace(/'/g, "\\'")}'>
            <div class="font-medium text-gray-800">${customer.customerName || '未命名客户'}</div>
            <div class="text-sm text-gray-600">${customer.contactName ? '联系人: ' + customer.contactName : ''} ${customer.phone ? ' | 电话: ' + customer.phone : ''}</div>
        </div>
    `).join('');
    
    dropdown.querySelectorAll('[data-customer]').forEach(item => {
        item.addEventListener('click', function() {
            const customer = JSON.parse(this.dataset.customer);
            fillBusinessFormWithCustomer(customer);
            dropdown.classList.add('hidden');
        });
    });
}

function fillBusinessFormWithCustomer(customer) {
    document.getElementById('businessCustomerName').value = customer.customerName || '';
    document.getElementById('businessContact').value = customer.contactName || '';
    document.getElementById('businessPhone').value = customer.phone || '';
    document.getElementById('businessEmail').value = customer.email || '';
    document.getElementById('businessAddress').value = customer.address || '';
    
    // 自动加载该客户的历史联系记录（排除已完成和已下单状态）
    const records = getBusinessRecords();
    const customerRecords = records.filter(r => 
        r.customerName === customer.customerName &&
        r.status !== '已完成' &&
        r.status !== '已下单'
    );
    
    if (customerRecords.length > 0) {
        // 将历史记录的联系简要填充到联系记录列表
        temporaryContactRecords = [];
        customerRecords.forEach(record => {
            if (record.needs) {
                temporaryContactRecords.push({
                    date: record.contactDate || record.lastContactDate || '',
                    type: '历史记录',
                    content: record.needs,
                    feedback: '',
                    nextFollowup: record.nextFollowup || ''
                });
            }
        });
        renderBusinessContactRecords();
    }
}

// 获取业务跟踪记录
function getBusinessRecords() {
    const records = localStorage.getItem('businessRecords');
    return records ? JSON.parse(records) : [];
}

// 保存业务跟踪记录
function saveBusinessRecords(records) {
    localStorage.setItem('businessRecords', JSON.stringify(records));
}

// 初始化业务跟踪模块
function initBusinessTab() {
    loadBusinessList();
}

// 加载客户列表
function loadBusinessList() {
    const list = document.getElementById('businessList');
    const paginationContainer = document.getElementById('businessPagination');
    if (!list) return;
    
    const records = getBusinessRecords();
    const searchTerm = document.getElementById('businessSearch')?.value || '';
    const statusFilter = document.getElementById('businessStatusFilter')?.value || '';
    const reminderFilter = document.getElementById('businessReminderFilter')?.value || '';
    
    // 过滤记录
    let filteredRecords = records;
    
    if (searchTerm) {
        filteredRecords = filteredRecords.filter(r => 
            r.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.contact && r.contact.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }
    
    if (statusFilter) {
        filteredRecords = filteredRecords.filter(r => r.status === statusFilter);
    }
    
    if (reminderFilter) {
        const today = new Date().toISOString().split('T')[0];
        if (reminderFilter === '需要提醒') {
            // 只提醒红底白字的记录（同一跟进单号的最后一条记录）
            filteredRecords = filteredRecords.filter(r => {
                if (!r.nextFollowup || r.nextFollowup < today) return false;
                if (!r.followupNo) return true; // 没有跟进单号的记录正常显示
                
                // 统计该跟进单号的记录数量
                const count = filteredRecords.filter(f => f.followupNo === r.followupNo).length;
                if (count < 2) return true; // 只有一条记录的正常显示
                
                // 找出该跟进单号的所有记录并按日期排序
                const sameFollowupRecords = filteredRecords
                    .filter(f => f.followupNo === r.followupNo)
                    .sort((a, b) => {
                        const dateA = a.contactDate || '';
                        const dateB = b.contactDate || '';
                        return dateA.localeCompare(dateB);
                    });
                
                // 只有最后一条记录才显示提醒
                return sameFollowupRecords[sameFollowupRecords.length - 1].id === r.id;
            });
        } else if (reminderFilter === '已过期') {
            filteredRecords = filteredRecords.filter(r => r.nextFollowup && r.nextFollowup < today);
        }
    }
    
    // 应用排序
    const sortState = pageController ? pageController.sortState.business : { column: 'followupNo', direction: 'desc' };
    filteredRecords = pageController.applySort(filteredRecords, sortState);
    
    // 设置分页数据
    paginations.business.setFilteredData(filteredRecords);
    const pagination = paginations.business;
    const currentPageData = pagination.getCurrentPageData();
    
    if (currentPageData.length === 0) {
        list.innerHTML = '<tr><td colspan="11" class="text-center py-8 text-gray-500">暂无客户记录</td></tr>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    
    const info = pagination.getPaginationInfo();
    
    // 统计每个跟进单号的记录数量
    const followupCount = {};
    filteredRecords.forEach(record => {
        if (record.followupNo) {
            followupCount[record.followupNo] = (followupCount[record.followupNo] || 0) + 1;
        }
    });
    
    // 创建跟进单号到记录列表的映射（按联系日期排序）
    const followupRecords = {};
    filteredRecords.forEach(record => {
        if (record.followupNo) {
            if (!followupRecords[record.followupNo]) {
                followupRecords[record.followupNo] = [];
            }
            followupRecords[record.followupNo].push(record);
        }
    });
    
    // 对每个跟进单号的记录按联系日期排序
    Object.keys(followupRecords).forEach(followupNo => {
        followupRecords[followupNo].sort((a, b) => {
            const dateA = a.contactDate || '';
            const dateB = b.contactDate || '';
            return dateA.localeCompare(dateB);
        });
    });
    
    // 获取最后一条记录的ID集合
    const lastRecordIds = new Set();
    Object.keys(followupRecords).forEach(followupNo => {
        const records = followupRecords[followupNo];
        if (records.length >= 2) {
            const lastRecord = records[records.length - 1];
            lastRecordIds.add(lastRecord.id);
        }
    });
    
    list.innerHTML = currentPageData.map((record, idx) => {
        const today = new Date().toISOString().split('T')[0];
        const isOverdue = record.nextFollowup && record.nextFollowup < today;
        const isDueToday = record.nextFollowup && record.nextFollowup === today;
        
        // 判断是否是同一跟进单号的最后一条记录（当有2条或以上时）
        const isLastRecord = lastRecordIds.has(record.id);
        
        let statusBadge = '';
        switch(record.status) {
            case '跟进中/已发邮件': statusBadge = 'bg-blue-500 text-white font-semibold'; break;
            case '已回复': statusBadge = 'bg-green-500 text-white font-semibold'; break;
            case '已下单': statusBadge = 'bg-purple-600 text-white font-semibold'; break;
            case '已终止': statusBadge = 'bg-red-500 text-white font-semibold'; break;
            default: statusBadge = 'bg-gray-300 text-gray-800';
        }
        
        // 下次跟进样式逻辑
        let followupClass = '';
        let followupBadgeClass = '';
        if (record.followupNo && followupCount[record.followupNo] >= 2) {
            if (isLastRecord) {
                // 最后一条记录
                // 如果状态是已下单或已终止，显示绿底白字
                if (record.status === '已下单' || record.status === '已终止') {
                    followupBadgeClass = 'bg-green-600 text-white px-2 py-0.5 rounded';
                } else {
                    // 否则显示鲜红底白字
                    followupBadgeClass = 'bg-red-600 text-white px-2 py-0.5 rounded';
                }
            } else {
                // 非最后一条记录：浅绿色
                followupBadgeClass = 'bg-green-200 text-green-800 px-2 py-0.5 rounded';
            }
        } else {
            // 只有一条记录或没有跟进单号时，使用原有逻辑
            if (isOverdue) followupClass = 'text-red-600 font-bold';
            else if (isDueToday) followupClass = 'text-orange-600 font-bold';
            else if (record.nextFollowup) followupClass = 'text-gray-600';
        }
        
        const rowNum = info.startIndex + idx;
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm">${rowNum}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex gap-2">
                        <button class="text-blue-600 hover:text-blue-800" onclick="editBusinessRecord('${record.id}')" title="编辑">
                            ✏️
                        </button>
                        <button class="text-red-600 hover:text-red-800" onclick="deleteBusinessRecord('${record.id}')" title="删除">
                            🗑️
                        </button>
                    </div>
                </td>
                <td class="px-4 py-3 text-sm">
                    <span class="px-2 py-1 rounded text-xs ${statusBadge}" title="${record.status}">${record.status}</span>
                </td>
                <td class="px-4 py-3 text-sm" title="${record.contactDate || '-'}">${record.contactDate || '-'}</td>
                <td class="px-4 py-3 text-sm" title="${record.followupNo || '-'}">
                    ${record.followupNo ? `<span class="followup-highlight ${getHighlightedFollowupNos().includes(record.followupNo) ? 'followup-highlight-active' : ''}" ondblclick="toggleFollowupHighlight(this)">${record.followupNo}</span><button class="ml-1 text-blue-500 hover:text-blue-700 cursor-pointer" onclick="copyToClipboard('${record.followupNo}')" title="复制">📋</button>` : '-'}
                </td>
                <td class="px-4 py-3 text-sm" title="${record.quoteNo || '-'}">${record.quoteNo || '-'}</td>
                <td class="px-4 py-3 text-sm" title="${record.nextFollowup || '-'}">
                    ${record.nextFollowup ? `<span class="${followupBadgeClass || followupClass}">${record.nextFollowup}</span>` : '-'}
                    ${!followupBadgeClass && isOverdue ? ' ⚠️' : ''}
                    ${!followupBadgeClass && isDueToday ? ' ⭐' : ''}
                </td>
                <td class="px-4 py-3 text-sm font-medium" title="${record.customerName || '-'}">${record.customerName}</td>
                <td class="px-4 py-3 text-sm" title="${record.contact || '-'}">${record.contact || '-'}</td>
                <td class="px-4 py-3 text-sm" title="${record.needs || '-'}">${record.needs || '-'}</td>
                <td class="px-4 py-3 text-sm" title="${record.industry || '-'}">${record.industry || '-'}</td>
            </tr>
        `;
    }).join('');
    
    // 渲染分页控件
    if (paginationContainer) {
        paginationContainer.innerHTML = `
            <div class="flex flex-wrap items-center justify-between p-3 border-t">
                <!-- 记录统计 -->
                <div class="text-sm text-gray-600 mb-3 md:mb-0">
                    显示 <strong>${info.startIndex}</strong> 到 <strong>${info.endIndex}</strong> 条，共 <strong>${info.totalItems}</strong> 条记录
                </div>
                
                <!-- 分页控件 -->
                <div class="flex items-center space-x-2">
                    <!-- 每页显示条数 -->
                    <div class="flex items-center space-x-1">
                        <label for="businessPageSize" class="text-sm text-gray-600">每页显示：</label>
                        <select id="businessPageSize" class="form-input text-sm" style="width: 80px;">
                            <option value="10" ${info.pageSize === 10 ? 'selected' : ''}>10条</option>
                            <option value="20" ${info.pageSize === 20 ? 'selected' : ''}>20条</option>
                            <option value="50" ${info.pageSize === 50 ? 'selected' : ''}>50条</option>
                            <option value="100" ${info.pageSize === 100 ? 'selected' : ''}>100条</option>
                            <option value="200" ${info.pageSize === 200 ? 'selected' : ''}>200条</option>
                        </select>
                    </div>
                    
                    <!-- 页码导航 -->
                    <div class="flex items-center space-x-1 pagination-buttons">
                        <button id="businessFirstPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                            首页
                        </button>
                        <button id="businessPrevPage" class="btn btn-secondary btn-sm" ${info.currentPage === 1 ? 'disabled' : ''}>
                            上一页
                        </button>
                        
                        <!-- 页码显示 -->
                        <div class="text-sm text-gray-600 page-info">
                            <input type="number" id="businessPageInput" min="1" max="${info.totalPages}" value="${info.currentPage}" 
                                   class="form-input text-sm text-center">
                            <span>/ ${info.totalPages}</span>
                        </div>
                        
                        <button id="businessNextPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                            下一页
                        </button>
                        <button id="businessLastPage" class="btn btn-secondary btn-sm" ${info.currentPage === info.totalPages ? 'disabled' : ''}>
                            末页
                        </button>
                        
                        <!-- 跳转按钮 -->
                        <button id="businessGoPage" class="btn btn-primary btn-sm">
                            跳转
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // 绑定分页事件
        initBusinessPaginationEvents();
    }
}

// 初始化业务跟踪分页事件
function initBusinessPaginationEvents() {
    const firstPageBtn = document.getElementById('businessFirstPage');
    const prevPageBtn = document.getElementById('businessPrevPage');
    const nextPageBtn = document.getElementById('businessNextPage');
    const lastPageBtn = document.getElementById('businessLastPage');
    const goPageBtn = document.getElementById('businessGoPage');
    const pageInput = document.getElementById('businessPageInput');
    const pageSizeSelect = document.getElementById('businessPageSize');
    
    if (firstPageBtn) {
        firstPageBtn.onclick = () => {
            paginations.business.firstPage();
            loadBusinessList();
        };
    }
    
    if (prevPageBtn) {
        prevPageBtn.onclick = () => {
            paginations.business.prevPage();
            loadBusinessList();
        };
    }
    
    if (nextPageBtn) {
        nextPageBtn.onclick = () => {
            paginations.business.nextPage();
            loadBusinessList();
        };
    }
    
    if (lastPageBtn) {
        lastPageBtn.onclick = () => {
            paginations.business.lastPage();
            loadBusinessList();
        };
    }
    
    if (goPageBtn && pageInput) {
        goPageBtn.onclick = () => {
            const page = parseInt(pageInput.value);
            if (!isNaN(page)) {
                paginations.business.goToPage(page);
                loadBusinessList();
            }
        };
    }
    
    if (pageInput) {
        pageInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                const page = parseInt(pageInput.value);
                if (!isNaN(page)) {
                    paginations.business.goToPage(page);
                    loadBusinessList();
                }
            }
        };
    }
    
    if (pageSizeSelect) {
        pageSizeSelect.onchange = () => {
            const size = parseInt(pageSizeSelect.value);
            paginations.business.setPageSize(size);
            loadBusinessList();
        };
    }
}

// 筛选业务记录
function filterBusiness() {
    loadBusinessList();
}

// 重置业务表单（保留联系日期，重新生成跟进单号）
function resetBusinessForm() {
    document.getElementById('businessCustomerName').value = '';
    document.getElementById('businessContact').value = '';
    document.getElementById('businessPhone').value = '';
    document.getElementById('businessEmail').value = '';
    document.getElementById('businessAddress').value = '';
    document.getElementById('businessIndustry').value = '';
    document.getElementById('businessStatus').value = '跟进中/已发邮件';
    document.getElementById('businessFollowupNo').value = generateFollowupNo();
    document.getElementById('businessQuoteNo').value = '';
    document.getElementById('businessNextFollowup').value = '';
    document.getElementById('businessNeeds').value = '';
    document.getElementById('businessContactRecords').innerHTML = '';
    temporaryContactRecords = [];
}

// 打开新增客户模态框
function openBusinessModal() {
    currentEditingBusinessId = null;
    document.getElementById('businessModalTitle').textContent = '新增记录';
    document.getElementById('businessCustomerName').value = '';
    document.getElementById('businessContact').value = '';
    document.getElementById('businessPhone').value = '';
    document.getElementById('businessEmail').value = '';
    document.getElementById('businessAddress').value = '';
    document.getElementById('businessIndustry').value = '';
    document.getElementById('businessStatus').value = '跟进中/已发邮件';
    document.getElementById('businessContactDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('businessFollowupNo').value = generateFollowupNo();
    document.getElementById('businessQuoteNo').value = '';
    document.getElementById('businessNextFollowup').value = '';
    document.getElementById('businessNeeds').value = '';
    document.getElementById('businessContactRecords').innerHTML = '';
    temporaryContactRecords = [];
    openModal('businessModal');
}

// 生成跟进单号（日期+4位随机数）
function generateFollowupNo() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(1000 + Math.random() * 9000);
    return dateStr + random;
}

// 当前编辑的客户ID
let currentEditingBusinessId = null;
let temporaryContactRecords = [];

// 编辑客户记录
function editBusinessRecord(id) {
    const records = getBusinessRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    currentEditingBusinessId = id;
    document.getElementById('businessModalTitle').textContent = '编辑记录';
    document.getElementById('businessCustomerName').value = record.customerName;
    document.getElementById('businessContact').value = record.contact || '';
    document.getElementById('businessPhone').value = record.phone || '';
    document.getElementById('businessEmail').value = record.email || '';
    document.getElementById('businessAddress').value = record.address || '';
    document.getElementById('businessIndustry').value = record.industry || '';
    document.getElementById('businessStatus').value = record.status || '跟进中/已发邮件';
    document.getElementById('businessContactDate').value = record.contactDate || '';
    document.getElementById('businessFollowupNo').value = record.followupNo || '';
    document.getElementById('businessQuoteNo').value = record.quoteNo || '';
    document.getElementById('businessNextFollowup').value = record.nextFollowup || '';
    document.getElementById('businessNeeds').value = record.needs || '';
    
    temporaryContactRecords = record.contactRecords || [];
    renderBusinessContactRecords();
    
    openModal('businessModal');
}

// 渲染联系记录列表
function renderBusinessContactRecords() {
    const container = document.getElementById('businessContactRecords');
    if (!container) return;
    
    if (temporaryContactRecords.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">暂无联系记录</p>';
        return;
    }
    
    container.innerHTML = temporaryContactRecords.map((record, index) => {
        let feedbackBadge = '';
        switch(record.feedback) {
            case '积极': feedbackBadge = 'bg-green-100 text-green-700'; break;
            case '中性': feedbackBadge = 'bg-gray-100 text-gray-700'; break;
            case '消极': feedbackBadge = 'bg-red-100 text-red-700'; break;
            case '待回复': feedbackBadge = 'bg-yellow-100 text-yellow-700'; break;
        }
        
        return `
            <div class="bg-gray-50 p-3 rounded border border-gray-200">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-medium">${record.date}</span>
                            <span class="text-xs px-2 py-0.5 rounded ${feedbackBadge}">${record.feedback}</span>
                        </div>
                        <p class="text-sm text-gray-600">${record.type} - ${record.content}</p>
                    </div>
                    <div class="flex gap-1 ml-2">
                        <button class="text-blue-600 hover:text-blue-800 text-xs" onclick="editBusinessContactRecord(${index})">编辑</button>
                        <button class="text-red-600 hover:text-red-800 text-xs" onclick="deleteBusinessContactRecord(${index})">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 添加联系记录（从模态框）
function addBusinessContactRecord() {
    const date = document.getElementById('businessContactDate').value || new Date().toISOString().split('T')[0];
    const type = document.getElementById('businessContactType').value;
    const content = document.getElementById('businessContactContent').value;
    const feedback = document.getElementById('businessContactFeedback').value;
    const nextFollowup = document.getElementById('businessContactNextFollowup').value;
    
    if (!content) {
        alert('请填写联系内容');
        return;
    }
    
    temporaryContactRecords.push({
        date,
        type,
        content,
        feedback,
        nextFollowup
    });
    
    // 清空表单
    document.getElementById('businessContactContent').value = '';
    document.getElementById('businessContactNextFollowup').value = '';
    
    renderBusinessContactRecords();
    closeModal('businessContactModal');
}

// 编辑联系记录
function editBusinessContactRecord(index) {
    const record = temporaryContactRecords[index];
    if (!record) return;
    
    document.getElementById('businessContactDate').value = record.date;
    document.getElementById('businessContactType').value = record.type;
    document.getElementById('businessContactContent').value = record.content;
    document.getElementById('businessContactFeedback').value = record.feedback;
    document.getElementById('businessContactNextFollowup').value = record.nextFollowup || '';
    
    // 标记编辑的索引
    document.getElementById('businessContactModal').dataset.editingIndex = index;
    document.getElementById('businessContactModalTitle').textContent = '编辑联系记录';
    openModal('businessContactModal');
}

// 保存联系记录
function saveBusinessContactRecord() {
    const modal = document.getElementById('businessContactModal');
    const editingIndex = modal.dataset.editingIndex;
    
    const date = document.getElementById('businessContactDate').value;
    const type = document.getElementById('businessContactType').value;
    const content = document.getElementById('businessContactContent').value;
    const feedback = document.getElementById('businessContactFeedback').value;
    const nextFollowup = document.getElementById('businessContactNextFollowup').value;
    
    if (!content) {
        alert('请填写联系内容');
        return;
    }
    
    const recordData = { date, type, content, feedback, nextFollowup };
    
    if (editingIndex !== undefined && editingIndex !== '') {
        temporaryContactRecords[parseInt(editingIndex)] = recordData;
    } else {
        temporaryContactRecords.push(recordData);
    }
    
    delete modal.dataset.editingIndex;
    document.getElementById('businessContactModalTitle').textContent = '添加联系记录';
    document.getElementById('businessContactContent').value = '';
    document.getElementById('businessContactNextFollowup').value = '';
    
    renderBusinessContactRecords();
    closeModal('businessContactModal');
}

// 删除联系记录
function deleteBusinessContactRecord(index) {
    if (confirm('确定要删除这条联系记录吗？')) {
        temporaryContactRecords.splice(index, 1);
        renderBusinessContactRecords();
    }
}

// 自动更新同一跟进单号的状态：保留最新日期的记录，其他设为"已回复"
function autoUpdateSameFollowupNoStatus(records) {
    const followupNoGroups = {};
    
    // 按跟进单号分组
    records.forEach(record => {
        if (record.followupNo) {
            if (!followupNoGroups[record.followupNo]) {
                followupNoGroups[record.followupNo] = [];
            }
            followupNoGroups[record.followupNo].push(record);
        }
    });
    
    // 对每个分组进行处理
    Object.keys(followupNoGroups).forEach(followupNo => {
        const group = followupNoGroups[followupNo];
        if (group.length >= 2) {
            // 按联系日期降序排序
            group.sort((a, b) => {
                const dateA = a.contactDate ? new Date(a.contactDate) : new Date(0);
                const dateB = b.contactDate ? new Date(b.contactDate) : new Date(0);
                return dateB - dateA;
            });
            
            // 保留第一条（最新日期）的状态，其他设为"已回复"
            // 但不修改正在编辑的记录
            for (let i = 1; i < group.length; i++) {
                if (group[i].id !== currentEditingBusinessId) {
                    group[i].status = '已回复';
                }
            }
        }
    });
    
    return records;
}

// 保存客户记录
function saveBusinessRecord() {
    const customerName = document.getElementById('businessCustomerName').value.trim();
    if (!customerName) {
        alert('请输入客户名称');
        return;
    }
    
    const records = getBusinessRecords();
    
    // 计算最近联系日期
    let lastContactDate = null;
    if (temporaryContactRecords.length > 0) {
        const sortedRecords = [...temporaryContactRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
        lastContactDate = sortedRecords[0].date;
    }
    
    // 计算下次跟进日期
    let nextFollowup = document.getElementById('businessNextFollowup').value;
    if (!nextFollowup && temporaryContactRecords.length > 0) {
        const withFollowup = temporaryContactRecords.filter(r => r.nextFollowup);
        if (withFollowup.length > 0) {
            const sortedFollowup = withFollowup.sort((a, b) => new Date(a.nextFollowup) - new Date(b.nextFollowup));
            nextFollowup = sortedFollowup[0].nextFollowup;
        }
    }
    
    const recordData = {
        id: currentEditingBusinessId || 'biz_' + Date.now(),
        customerName,
        contact: document.getElementById('businessContact').value.trim(),
        phone: document.getElementById('businessPhone').value.trim(),
        email: document.getElementById('businessEmail').value.trim(),
        address: document.getElementById('businessAddress').value.trim(),
        industry: document.getElementById('businessIndustry').value.trim(),
        status: document.getElementById('businessStatus').value,
        contactDate: document.getElementById('businessContactDate').value,
        followupNo: document.getElementById('businessFollowupNo').value,
        quoteNo: document.getElementById('businessQuoteNo').value.trim(),
        nextFollowup,
        needs: document.getElementById('businessNeeds').value.trim(),
        contactRecords: [...temporaryContactRecords],
        lastContactDate,
        updatedAt: new Date().toLocaleString('zh-CN')
    };
    
    if (currentEditingBusinessId) {
        // 更新现有记录
        const index = records.findIndex(r => r.id === currentEditingBusinessId);
        if (index !== -1) {
            records[index] = recordData;
        }
    } else {
        // 新增记录
        records.push(recordData);
    }
    
    // 自动更新同一跟进单号的状态：保留最新日期的记录，其他设为"已回复"
    const updatedRecords = autoUpdateSameFollowupNoStatus(records);
    saveBusinessRecords(updatedRecords);
    closeModal('businessModal');
    loadBusinessList();
    
    // 重置临时数据
    currentEditingBusinessId = null;
    temporaryContactRecords = [];
}

// 删除客户记录
function deleteBusinessRecord(id) {
    if (confirm('确定要删除这个客户记录吗？')) {
        const records = getBusinessRecords();
        const updatedRecords = records.filter(r => r.id !== id);
        saveBusinessRecords(updatedRecords);
        loadBusinessList();
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initNavigationTabs();
        initDropdowns();
        // 初始化备忘录模块
        initMemoTab();
        // 初始化业务跟踪模块
        initBusinessTab();
        setupBusinessAutocomplete();
        // 初始化默认显示的标签页
        pageController.switchTab('order');
        // 更新国家筛选选项
        updateCountryFilterOptions();
    });
} else {
    initNavigationTabs();
    initDropdowns();
    // 初始化备忘录模块
    initMemoTab();
    // 初始化业务跟踪模块
    initBusinessTab();
    setupBusinessAutocomplete();
    // 初始化默认显示的标签页
    pageController.switchTab('order');
    // 更新国家筛选选项
    updateCountryFilterOptions();
}

// ==================== Supabase 云端数据到达后自动重渲染 ====================
// supabase-sync.js 云端数据同步到本地后会派发 cloud-data-updated 事件。
// 首次加载时各标签页渲染早于云端数据返回，需在数据到达后刷新当前可见标签页。
(function setupCloudUpdateHandler() {
    // 强制从存储重读某标签页的分页数据（云端数据到达后，分页缓存可能仍是旧数据）
    function reloadPagination(pName, getterName) {
        try {
            if (typeof storage === 'undefined' || !paginations[pName]) return;
            if (typeof storage[getterName] !== 'function') return;
            var latest = storage[getterName]();
            if (Array.isArray(latest) && typeof paginations[pName].setData === 'function') {
                paginations[pName].setData(latest);
            }
        } catch (err) { console.warn('[CloudUpdate] 重读分页数据失败:', pName, err); }
    }

    // 存储键 → 该标签页的重渲染函数
    var keyRenderers = {
        orderRecords: function () {
            reloadPagination('order', 'getOrderRecords');
            if (pageController && typeof pageController.renderOrderTable === 'function') pageController.renderOrderTable();
        },
        exportRecords: function () {
            reloadPagination('export', 'getExportRecords');
            if (pageController && typeof pageController.renderExportTable === 'function') pageController.renderExportTable();
        },
        receiptRecords: function () {
            reloadPagination('receipt', 'getReceiptRecords');
            if (pageController && typeof pageController.renderReceiptTable === 'function') pageController.renderReceiptTable();
        },
        invoiceRecords: function () {
            reloadPagination('invoice', 'getInvoiceRecords');
            if (pageController && typeof pageController.renderInvoiceTable === 'function') pageController.renderInvoiceTable();
        },
        indexPaymentRecords: function () {
            reloadPagination('payment', 'getPaymentRecords');
            if (pageController && typeof pageController.renderPaymentTable === 'function') pageController.renderPaymentTable();
        },
        customerRecords: function () {
            reloadPagination('customer', 'getCustomerRecords');
            if (pageController && typeof pageController.renderCustomerTable === 'function') pageController.renderCustomerTable();
        },
        memoRecords: function () {
            if (typeof renderMemoList === 'function') renderMemoList();
        },
        businessRecords: function () {
            if (typeof loadBusinessList === 'function') loadBusinessList();
        }
    };

    window.addEventListener('cloud-data-updated', function (e) {
        var changedKeys = (e && e.detail && e.detail.keys) || [];
        if (changedKeys.length === 0) return;

        var activeTab = (pageController && pageController.currentActiveTab) || 'order';
        // 标签页 → 该页关心的存储键
        var tabKeys = {
            order: ['orderRecords'],
            export: ['exportRecords'],
            receipt: ['receiptRecords'],
            invoice: ['invoiceRecords'],
            payment: ['indexPaymentRecords'],
            customer: ['customerRecords'],
            memo: ['memoRecords'],
            business: ['businessRecords'],
            report: ['orderRecords', 'exportRecords', 'receiptRecords', 'invoiceRecords', 'indexPaymentRecords']
        };
        var keysOfCurrentTab = tabKeys[activeTab] || [];
        var hitKeys = changedKeys.filter(function (k) { return keysOfCurrentTab.indexOf(k) >= 0; });

        hitKeys.forEach(function (k) {
            var renderer = keyRenderers[k];
            if (renderer) {
                try { renderer(); } catch (err) { console.warn('[CloudUpdate] 重渲染失败:', k, err); }
            }
        });

        // 报表统计受多张表影响，任何业务键变化时若在报表页则刷新
        if (activeTab === 'report' && typeof updateReportStatistics === 'function') {
            try { updateReportStatistics(); } catch (err) {}
        }
    });
})();