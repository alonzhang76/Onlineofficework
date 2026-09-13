// 增强付款记录模态框的订单号选择功能
document.addEventListener('DOMContentLoaded', function() {
    console.log('Enhanced payment functionality loaded');
    
    // 监听模态框打开事件
    document.addEventListener('click', function(e) {
        // 检查是否点击了"新增付款记录"按钮
        if (e.target.matches('[onclick="openModal(\'paymentModal\')"]') || 
            e.target.closest('[onclick="openModal(\'paymentModal\')"]')) {
            console.log('Payment modal opening...');
            // 延迟初始化，确保模态框已完全打开
            setTimeout(function() {
                initOrderNoSelection();
                initOrderNoSearch();
                initOrderAmountCalculation();
            }, 100);
        }
    });
    
    // 初始化订单金额计算功能
    function initOrderAmountCalculation() {
        console.log('Initializing order amount calculation...');
        
        // 获取元素
        const paymentType = document.getElementById('paymentType');
        const orderSelect = document.getElementById('paymentOrderNo');
        const orderSearch = document.getElementById('paymentOrderNoSearch');
        const paymentAmountInput = document.getElementById('paymentAmount');
        
        if (!paymentType || !paymentAmountInput) {
            console.error('Required elements not found for amount calculation');
            return;
        }
        
        // 计算订单金额总和
        function calculateTotalOrderAmount() {
            let orderNos = [];
            
            // 根据付款类型获取订单号
            if (paymentType.value === '预付款') {
                // 预付款：从multiple select获取选中的订单号
                if (orderSelect && orderSelect.selectedOptions) {
                    orderNos = Array.from(orderSelect.selectedOptions).map(option => option.value.trim());
                }
            } else {
                // 其他付款类型：从搜索输入框获取订单号
                if (orderSearch && orderSearch.value) {
                    orderNos = orderSearch.value
                        .split(',')
                        .map(no => no.trim())
                        .filter(Boolean);
                }
            }
            
            console.log('Calculating total payment for order nos:', orderNos);
            
            // 获取所有付款记录（账务管理表格数据）
            const allPaymentRecords = storage.getPaymentRecords();
            let totalAmount = 0;
            
            // 遍历订单号，查找对应的所有付款记录并累加金额
            orderNos.forEach(orderNo => {
                // 查找所有包含该订单号的付款记录
                const matchingPayments = allPaymentRecords.filter(payment => {
                    // 付款记录的orderNo可能是逗号分隔的多个订单号
                    const paymentOrderNos = payment.orderNo
                        .split(',')
                        .map(no => no.trim())
                        .filter(Boolean);
                    return paymentOrderNos.includes(orderNo);
                });
                
                // 累加所有匹配付款记录的金额
                matchingPayments.forEach(payment => {
                    if (payment && payment.amount) {
                        const paymentAmount = parseFloat(payment.amount) || 0;
                        totalAmount += paymentAmount;
                        console.log(`Order ${orderNo} payment amount: ${paymentAmount}, total: ${totalAmount}`);
                    }
                });
            });
            
            return totalAmount;
        }
        
        // 更新付款金额输入框的提示
        function updatePaymentAmountTooltip() {
            const totalAmount = calculateTotalOrderAmount();
            const tooltipText = `所选订单在账务管理中的付款金额合计: ¥${totalAmount.toFixed(2)}`;
            
            // 移除旧的自定义tooltip
            let existingTooltip = document.getElementById('customAmountTooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }
            
            // 创建自定义tooltip元素
            existingTooltip = document.createElement('div');
            existingTooltip.id = 'customAmountTooltip';
            existingTooltip.textContent = tooltipText;
            existingTooltip.style.cssText = `
                position: absolute;
                background-color: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 1000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.1s ease;
                max-width: 300px;
                word-wrap: break-word;
            `;
            
            // 添加到页面
            document.body.appendChild(existingTooltip);
            
            // 显示自定义tooltip的函数
            function showTooltip(event) {
                existingTooltip.style.opacity = '1';
                
                // 计算tooltip位置
                const rect = paymentAmountInput.getBoundingClientRect();
                existingTooltip.style.left = `${rect.left + window.scrollX}px`;
                existingTooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
            }
            
            // 隐藏自定义tooltip的函数
            function hideTooltip() {
                existingTooltip.style.opacity = '0';
            }
            
            // 移除旧的事件监听器
            paymentAmountInput.removeEventListener('mouseenter', showTooltip);
            paymentAmountInput.removeEventListener('mouseleave', hideTooltip);
            paymentAmountInput.removeEventListener('focus', showTooltip);
            paymentAmountInput.removeEventListener('blur', hideTooltip);
            
            // 添加新的事件监听器
            paymentAmountInput.addEventListener('mouseenter', showTooltip);
            paymentAmountInput.addEventListener('mouseleave', hideTooltip);
            paymentAmountInput.addEventListener('focus', showTooltip);
            paymentAmountInput.addEventListener('blur', hideTooltip);
            
            // 同时保留原生title属性，作为备份
            paymentAmountInput.setAttribute('title', tooltipText);
            
            console.log('Updated payment amount tooltip:', tooltipText);
        }
        
        // 为预付款的select添加change事件监听
        if (orderSelect) {
            orderSelect.addEventListener('change', updatePaymentAmountTooltip);
        }
        
        // 为其他付款类型的搜索输入框添加input事件监听
        if (orderSearch) {
            orderSearch.addEventListener('input', updatePaymentAmountTooltip);
        }
        
        // 为付款类型变化添加监听
        paymentType.addEventListener('change', function() {
            // 延迟执行，确保UI已更新
            setTimeout(updatePaymentAmountTooltip, 100);
        });
        
        // 初始计算一次
        updatePaymentAmountTooltip();
        
        console.log('Order amount calculation initialized');
    }
    
    // 初始化订单号搜索功能
    function initOrderNoSearch() {
        console.log('Initializing order number search...');
        
        const paymentOrderNoSearch = document.getElementById('paymentOrderNoSearch');
        const paymentOrderNoSuggestions = document.getElementById('paymentOrderNoSuggestions');
        
        if (!paymentOrderNoSearch || !paymentOrderNoSuggestions) {
            console.error('Search input or suggestions element not found');
            return;
        }
        
        console.log('Search elements found, adding event listeners...');
        
        // 移除之前的事件监听器
        paymentOrderNoSearch.replaceWith(paymentOrderNoSearch.cloneNode(true));
        paymentOrderNoSuggestions.replaceWith(paymentOrderNoSuggestions.cloneNode(true));
        
        // 获取新的元素引用
        const newSearchInput = document.getElementById('paymentOrderNoSearch');
        const newSuggestions = document.getElementById('paymentOrderNoSuggestions');
        
        // 搜索处理函数
        function handleSearch() {
            const searchValue = newSearchInput.value;
            const searchTerm = searchValue.split(',').pop().trim();
            
            console.log('Searching for:', searchTerm);
            
            // 获取所有订单记录
            const orderRecords = storage.getOrderRecords();
            console.log('Total orders:', orderRecords.length);
            
            // 筛选匹配的订单号
            const matchedOrders = orderRecords.filter(order => {
                // 确保order.orderNo是字符串
                const orderNo = String(order.orderNo || '');
                return orderNo.toLowerCase().includes(searchTerm.toLowerCase());
            });
            
            console.log('Matched orders:', matchedOrders.length);
            
            // 对订单号进行去重处理，每个订单号只显示一次
            const uniqueOrders = [];
            const seenOrderNos = new Set();
            
            matchedOrders.forEach(order => {
                const orderNo = String(order.orderNo || '');
                if (!seenOrderNos.has(orderNo)) {
                    seenOrderNos.add(orderNo);
                    uniqueOrders.push(order);
                }
            });
            
            console.log('Unique orders:', uniqueOrders.length);
            
            // 清空建议列表
            newSuggestions.innerHTML = '';
            
            if (uniqueOrders.length > 0) {
                // 添加建议项
                uniqueOrders.forEach(order => {
                    const div = document.createElement('div');
                    div.className = 'p-2 hover:bg-gray-100 cursor-pointer';
                    div.dataset.orderNo = order.orderNo;
                    div.dataset.customer = order.customer;
                    div.textContent = order.orderNo;
                    newSuggestions.appendChild(div);
                });
                
                // 显示建议列表
                newSuggestions.style.display = 'block';
                newSuggestions.classList.remove('hidden');
                console.log('Suggestions displayed');
            } else {
                // 隐藏建议列表
                newSuggestions.classList.add('hidden');
                newSuggestions.style.display = 'none';
                console.log('No suggestions found');
            }
        }
        
        // 建议项点击处理函数
        function handleSuggestionClick(e) {
            if (e.target.tagName === 'DIV') {
                const orderNo = e.target.dataset.orderNo;
                const customer = e.target.dataset.customer;
                
                if (orderNo) {
                    let currentValue = newSearchInput.value;
                    
                    // 处理当前输入值：保留最后一个逗号之前的内容，替换最后一个逗号后的内容
                    const lastCommaIndex = currentValue.lastIndexOf(',');
                    let prefix = '';
                    
                    if (lastCommaIndex !== -1) {
                        prefix = currentValue.substring(0, lastCommaIndex + 1);
                    }
                    
                    // 构建新值：前缀 + 选中的订单号
                    let newValue = prefix + orderNo;
                    
                    // 将当前值拆分为订单号数组，并去除空值和空格
                    const existingOrderNos = newValue.split(',').map(no => no.trim()).filter(Boolean);
                    
                    // 去重处理
                    const uniqueOrderNos = [...new Set(existingOrderNos)];
                    newValue = uniqueOrderNos.join(',');
                    
                    // 更新输入框值
                    newSearchInput.value = newValue;
                    
                    // 更新客户信息
                    const customerInput = document.getElementById('paymentCustomer');
                    if (customerInput && customer) {
                        customerInput.value = customer;
                    }
                    
                    // 强制隐藏建议列表
                    newSuggestions.classList.add('hidden');
                    newSuggestions.style.display = 'none';
                    // 清空建议列表内容
                    newSuggestions.innerHTML = '';
                    
                    console.log('Order selected:', orderNo);
                    
                    // 触发input事件，更新金额合计提示
                    newSearchInput.dispatchEvent(new Event('input'));
                    
                    // 阻止事件冒泡，避免触发其他点击事件
                    e.stopPropagation();
                }
            }
        }
        
        // 添加事件监听器
        newSearchInput.addEventListener('input', handleSearch);
        newSearchInput.addEventListener('focus', handleSearch);
        newSuggestions.addEventListener('click', handleSuggestionClick);
        
        // 点击页面其他地方关闭建议列表
        document.addEventListener('click', function(e) {
            if (!newSearchInput.contains(e.target) && !newSuggestions.contains(e.target)) {
                newSuggestions.classList.add('hidden');
                newSuggestions.style.display = 'none';
                newSuggestions.innerHTML = '';
                console.log('Suggestions hidden by click outside');
            }
        });
        
        console.log('Order number search initialized');
    }
    
    // 初始化订单号选择方式
    function initOrderNoSelection() {
        const paymentTypeSelect = document.getElementById('paymentType');
        const orderNoInputWrapper = document.getElementById('orderNoInputWrapper');
        const orderNoSearchWrapper = document.getElementById('orderNoSearchWrapper');
        const orderNoSelectTip = document.getElementById('orderNoSelectTip');
        
        if (!paymentTypeSelect || !orderNoInputWrapper || !orderNoSearchWrapper || !orderNoSelectTip) {
            return;
        }
        
        // 获取两个订单号控件
        const orderSelect = document.getElementById('paymentOrderNo');
        const orderSearchInput = document.getElementById('paymentOrderNoSearch');
        
        const paymentType = paymentTypeSelect.value;
        if (paymentType === '预付款') {
            // 预付款：使用原来的multiple select方式
            orderNoInputWrapper.classList.remove('hidden');
            orderNoSearchWrapper.classList.add('hidden');
            orderNoSelectTip.textContent = '(按Ctrl键可多选)';
            
            // 为select添加name和required属性，移除search input的name属性
            if (orderSelect) {
                orderSelect.setAttribute('name', 'orderNo');
                orderSelect.setAttribute('required', 'required');
            }
            if (orderSearchInput) {
                orderSearchInput.removeAttribute('name');
                orderSearchInput.removeAttribute('required');
            }
        } else {
            // 其他付款类型：使用搜索输入框方式
            orderNoInputWrapper.classList.add('hidden');
            orderNoSearchWrapper.classList.remove('hidden');
            orderNoSelectTip.textContent = '(搜索订单号，点击选择)';
            
            // 移除select的name和required属性，为search input添加name和required属性
            if (orderSelect) {
                orderSelect.removeAttribute('name');
                orderSelect.removeAttribute('required');
            }
            if (orderSearchInput) {
                orderSearchInput.setAttribute('name', 'orderNo');
                orderSearchInput.setAttribute('required', 'required');
            }
        }
    }
    
    // 监听付款类型变化事件
    const paymentTypeSelect = document.getElementById('paymentType');
    if (paymentTypeSelect) {
        paymentTypeSelect.addEventListener('change', function() {
            initOrderNoSelection();
            // 付款类型变化后重新初始化搜索功能
            setTimeout(function() {
                initOrderNoSearch();
                initOrderAmountCalculation();
            }, 50);
        });
    }
    
    // 初始化收款单位选择功能
    function initRecipientSelection() {
        const recipientSelect = document.getElementById('paymentRecipientSelect');
        const recipientInput = document.getElementById('paymentRecipientInput');
        const recipientHidden = document.getElementById('paymentRecipient');
        
        if (!recipientSelect || !recipientInput || !recipientHidden) {
            console.error('Recipient selection elements not found');
            return;
        }
        
        // 处理下拉框变化事件
        function handleRecipientChange() {
            const selectedValue = recipientSelect.value;
            
            if (selectedValue === 'other') {
                // 选择"其他"时显示输入框
                recipientInput.classList.remove('hidden');
                recipientInput.focus();
                recipientHidden.value = '';
            } else {
                // 选择具体单位时隐藏输入框
                recipientInput.classList.add('hidden');
                recipientHidden.value = selectedValue;
            }
        }
        
        // 处理输入框变化事件
        function handleRecipientInput() {
            recipientHidden.value = recipientInput.value;
        }
        
        // 添加事件监听器
        recipientSelect.addEventListener('change', handleRecipientChange);
        recipientInput.addEventListener('input', handleRecipientInput);
        recipientInput.addEventListener('blur', handleRecipientInput);
        
        // 初始化状态
        handleRecipientChange();
        
        console.log('Recipient selection initialized');
    }
    
    // 初始化收款单位选择功能（通用函数，支持新增和编辑模态框）
    function initRecipientSelection(modalType = 'payment') {
        const prefix = modalType === 'payment' ? '' : 'edit';
        const modalId = modalType === 'payment' ? 'paymentModal' : 'editPaymentModal';
        
        // 确保模态框已打开
        const modal = document.getElementById(modalId);
        if (!modal || modal.classList.contains('hidden')) {
            console.error('Modal not found or hidden:', modalId);
            return;
        }
        
        const recipientSelect = document.getElementById(`${prefix}PaymentRecipientSelect`);
        const recipientInput = document.getElementById(`${prefix}PaymentRecipientInput`);
        const recipientHidden = document.getElementById(`${prefix}PaymentRecipient`);
        
        if (!recipientSelect || !recipientInput || !recipientHidden) {
            console.error('Recipient selection elements not found for modal:', modalType);
            return;
        }
        
        console.log('Initializing recipient selection for modal:', modalType);
        
        // 移除旧的事件监听器，避免重复添加
        recipientSelect.removeEventListener('change', handleRecipientChange);
        recipientInput.removeEventListener('input', handleRecipientInput);
        recipientInput.removeEventListener('blur', handleRecipientInput);
        
        // 处理下拉框变化事件
        function handleRecipientChange() {
            const selectedValue = recipientSelect.value;
            console.log('Recipient select changed to:', selectedValue);
            
            if (selectedValue === 'other') {
                // 选择"其他"时显示输入框
                recipientInput.classList.remove('hidden');
                recipientInput.focus();
                recipientHidden.value = '';
                console.log('Other selected, showing input');
            } else {
                // 选择具体单位时隐藏输入框
                recipientInput.classList.add('hidden');
                recipientHidden.value = selectedValue;
                console.log('Specific recipient selected:', selectedValue);
            }
            console.log('Hidden input value set to:', recipientHidden.value);
        }
        
        // 处理输入框变化事件
        function handleRecipientInput() {
            recipientHidden.value = recipientInput.value;
            console.log('Recipient input changed to:', recipientInput.value);
        }
        
        // 添加事件监听器
        recipientSelect.addEventListener('change', handleRecipientChange);
        recipientInput.addEventListener('input', handleRecipientInput);
        recipientInput.addEventListener('blur', handleRecipientInput);
        
        // 初始化状态
        handleRecipientChange();
        
        console.log('Recipient selection initialized for modal:', modalType);
    }
    
    // 直接为收款单位选择框添加事件监听器
    function addRecipientEventListeners() {
        // 处理新增付款记录模态框
        const addRecipientSelect = document.getElementById('paymentRecipientSelect');
        const addRecipientInput = document.getElementById('paymentRecipientInput');
        const addRecipientHidden = document.getElementById('paymentRecipient');
        
        if (addRecipientSelect && addRecipientInput && addRecipientHidden) {
            console.log('Adding event listeners for add payment modal');
            
            // 添加change事件监听器
            addRecipientSelect.onchange = function() {
                const selectedValue = this.value;
                console.log('Add recipient select changed to:', selectedValue);
                
                if (selectedValue === 'other') {
                    addRecipientInput.classList.remove('hidden');
                    addRecipientInput.focus();
                    addRecipientHidden.value = '';
                } else {
                    addRecipientInput.classList.add('hidden');
                    addRecipientHidden.value = selectedValue;
                }
                console.log('Add recipient hidden value:', addRecipientHidden.value);
            };
            
            // 添加input事件监听器
            addRecipientInput.oninput = function() {
                addRecipientHidden.value = this.value;
                console.log('Add recipient input changed to:', this.value);
            };
        }
        
        // 处理编辑付款记录模态框
        const editRecipientSelect = document.getElementById('editPaymentRecipientSelect');
        const editRecipientInput = document.getElementById('editPaymentRecipientInput');
        const editRecipientHidden = document.getElementById('editPaymentRecipient');
        
        if (editRecipientSelect && editRecipientInput && editRecipientHidden) {
            console.log('Adding event listeners for edit payment modal');
            
            // 添加change事件监听器
            editRecipientSelect.onchange = function() {
                const selectedValue = this.value;
                console.log('Edit recipient select changed to:', selectedValue);
                
                if (selectedValue === 'other') {
                    editRecipientInput.classList.remove('hidden');
                    editRecipientInput.focus();
                    editRecipientHidden.value = '';
                } else {
                    editRecipientInput.classList.add('hidden');
                    editRecipientHidden.value = selectedValue;
                }
                console.log('Edit recipient hidden value:', editRecipientHidden.value);
            };
            
            // 添加input事件监听器
            editRecipientInput.oninput = function() {
                editRecipientHidden.value = this.value;
                console.log('Edit recipient input changed to:', this.value);
            };
        }
    }
    
    // 从表格数据中动态生成客户和收款单位选项
    function updatePaymentSearchOptions() {
        console.log('Updating payment search options from table data');
        
        // 获取所有付款记录
        const paymentRecords = storage.getPaymentRecords();
        
        // 提取唯一的客户和收款单位
        const customers = new Set();
        const recipients = new Set();
        
        paymentRecords.forEach(record => {
            if (record.customer) {
                customers.add(record.customer);
            }
            if (record.recipient) {
                recipients.add(record.recipient);
            }
        });
        
        console.log('Extracted customers:', Array.from(customers));
        console.log('Extracted recipients:', Array.from(recipients));
        
        // 更新客户下拉框
        const customerSelect = document.getElementById('paymentCustomerSearch');
        if (customerSelect) {
            // 保存当前选中值
            const currentValue = customerSelect.value;
            
            // 清空现有选项，保留默认选项
            const defaultOption = customerSelect.querySelector('option[value=""]');
            customerSelect.innerHTML = '';
            customerSelect.appendChild(defaultOption);
            
            // 添加新选项
            Array.from(customers).sort().forEach(customer => {
                const option = document.createElement('option');
                option.value = customer;
                option.textContent = customer;
                customerSelect.appendChild(option);
            });
            
            // 恢复当前选中值
            customerSelect.value = currentValue;
            console.log('Updated customer select options');
        }
        
        // 更新收款单位下拉框
        const recipientSelect = document.getElementById('paymentRecipientSearch');
        if (recipientSelect) {
            // 保存当前选中值
            const currentValue = recipientSelect.value;
            
            // 清空现有选项，保留默认选项
            const defaultOption = recipientSelect.querySelector('option[value=""]');
            recipientSelect.innerHTML = '';
            recipientSelect.appendChild(defaultOption);
            
            // 添加新选项
            Array.from(recipients).sort().forEach(recipient => {
                const option = document.createElement('option');
                option.value = recipient;
                option.textContent = recipient;
                recipientSelect.appendChild(option);
            });
            
            // 恢复当前选中值
            recipientSelect.value = currentValue;
            console.log('Updated recipient select options');
        }
    }
    
    // 在DOM加载完成后初始化
    document.addEventListener('DOMContentLoaded', function() {
        addRecipientEventListeners();
        updatePaymentSearchOptions();
    });
    
    // 监听表格数据变化，更新搜索选项
    // 可以在页面切换到账务管理时调用
    document.addEventListener('click', function(e) {
        // 监听切换到付款管理页面的事件
        if (e.target.matches('[data-tab="payment"]') || 
            e.target.closest('[data-tab="payment"]')) {
            setTimeout(updatePaymentSearchOptions, 200);
        }
    });
    
    // 监听新增付款记录按钮点击事件
    document.addEventListener('click', function(e) {
        if (e.target.matches('[onclick*="paymentModal"]') || 
            e.target.closest('[onclick*="paymentModal"]')) {
            setTimeout(addRecipientEventListeners, 150);
        }
    });
    
    // 监听编辑付款记录按钮点击事件
    document.addEventListener('click', function(e) {
        if (e.target.matches('[onclick*="editPayment("]') || 
            e.target.closest('[onclick*="editPayment("]')) {
            setTimeout(addRecipientEventListeners, 150);
        }
    });
    
    // 监听模态框关闭事件，清理自定义tooltip
    document.addEventListener('click', function(e) {
        // 检查是否点击了关闭按钮或模态框外部
        if (e.target.matches('[onclick*="closeModal"]') || 
            e.target.matches('.modal-overlay') || 
            e.target.closest('[onclick*="closeModal"]')) {
            // 移除自定义tooltip
            const customTooltip = document.getElementById('customAmountTooltip');
            if (customTooltip) {
                customTooltip.remove();
            }
        }
    });
});