const fs = require('fs');
const path = 'c:\\Users\\alon\\Downloads\\外贸出口管理系统\\app.js';

// 读取当前文件内容
const content = fs.readFileSync(path, 'utf8');

// 新的exportCustomerCards函数
const newFunction = `function exportCustomerCards() {
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
        
        let cardHTML = '\n            <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: bold; color: #2d3748;">' + (customer.customerName || '未命名客户') + '</h3>\n            <div style="font-size: 14px; line-height: 1.8; color: #4a5568;">\n        ';
        
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
        
        const createdAt = customer.createdAt || new Date().toISOString().split('T')[0];
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
}`;

// 使用正则表达式替换旧函数
const updatedContent = content.replace(/function exportCustomerCards\(\)\s*\{[\s\S]*?^\}/gm, newFunction);

// 写入更新后的内容
fs.writeFileSync(path, updatedContent, 'utf8');

console.log('exportCustomerCards函数已成功更新！');