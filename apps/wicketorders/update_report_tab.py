import re

# 读取原始HTML文件
with open('c:\\Users\\alon\\Downloads\\外贸出口管理系统\\index.html', 'r', encoding='utf-8') as f:
    original_content = f.read()

# 读取新的报表统计模块
with open('c:\\Users\\alon\\Downloads\\外贸出口管理系统\\report-tab.html', 'r', encoding='utf-8') as f:
    new_report_tab = f.read()

# 替换原始文件中的报表统计模块
# 使用非贪婪匹配和单行模式来匹配整个报表统计模块
updated_content = re.sub(r'(?s)(<div id="reportTab".*?</div>)', new_report_tab, original_content)

# 写入更新后的内容
with open('c:\\Users\\alon\\Downloads\\外贸出口管理系统\\index.html', 'w', encoding='utf-8') as f:
    f.write(updated_content)

print("文件更新成功！")