<script setup>
import { computed, onMounted, reactive, ref, nextTick } from "vue";
import { Link, Refresh, EditPen, Delete, Plus, Warning, InfoFilled, Connection, Setting } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import Sortable from "sortablejs";
import { useDomainsStore } from "../stores/domains";
import { useSettingsStore } from "../stores/settings";

const domainsStore = useDomainsStore();
const settingsStore = useSettingsStore();

const domains = computed(() => domainsStore.domains);
const loading = computed(() => domainsStore.loading);
const saving = ref(false);
const dialogOpen = ref(false);
const editingId = ref(null);
const search = ref("");
const categoryFilter = ref("all");

const categoryOptions = computed(() => {
  const cats = new Set(domains.value.map(d => d.category).filter(Boolean));
  return Array.from(cats);
});

const dictDialogOpen = ref(false);
const dictSaving = ref(false);
const dictForm = reactive({ registrars: [], dnsProviders: [] });

async function openDict() {
  await domainsStore.fetchDict();
  
  const mapKeywords = (list) => JSON.parse(JSON.stringify(list || [])).map(item => ({
    ...item,
    keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywords
  }));

  dictForm.registrars = mapKeywords(domainsStore.dict.registrars);
  dictForm.dnsProviders = mapKeywords(domainsStore.dict.dnsProviders);
  dictDialogOpen.value = true;
}

async function saveDict() {
  dictSaving.value = true;
  try {
    // ensure keywords is an array of strings
    const normalize = (list) => list.map(item => ({
      ...item,
      keywords: typeof item.keywords === 'string' ? item.keywords.split(',').map(s => s.trim()).filter(Boolean) : item.keywords
    }))
    await domainsStore.saveDict({
      registrars: normalize(dictForm.registrars),
      dnsProviders: normalize(dictForm.dnsProviders)
    });
    ElMessage.success("匹配字典已保存");
    dictDialogOpen.value = false;
  } catch (error) {
    ElMessage.error("保存失败");
  } finally {
    dictSaving.value = false;
  }
}

const categoryDialogOpen = ref(false);

async function promptRenameCategory(oldName) {
  try {
    const { value: newName } = await ElMessageBox.prompt('请输入新的分类名称', '重命名分类', {
      inputValue: oldName,
      inputValidator: (val) => {
        if (!val || !val.trim()) return '分类名不能为空'
        if (categoryOptions.value.includes(val.trim()) && val.trim() !== oldName) return '分类名已存在'
        return true
      }
    });
    const finalName = newName.trim();
    if (finalName === oldName) return;
    await domainsStore.renameCategory(oldName, finalName);
    if (categoryFilter.value === oldName) categoryFilter.value = finalName;
    ElMessage.success('分类已重命名');
  } catch (e) {
    // cancelled
  }
}

async function promptDeleteCategory(name) {
  try {
    await ElMessageBox.confirm(`确定删除分类“${name}”吗？这会将该分类下所有域名的分类置空，但不会删除域名本身。`, '删除分类', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
    await domainsStore.deleteCategory(name);
    if (categoryFilter.value === name) categoryFilter.value = 'all';
    ElMessage.success('分类已删除');
  } catch (e) {
    // cancelled
  }
}

const emptyForm = () => ({
  domain_name: "",
  category: "",
  registrar_name: "",
  registrar_url: "",
  dns_provider_name: "",
  dns_provider_url: "",
  notes: "",
  auto_update: 1
});

const form = reactive(emptyForm());
const tableRef = ref(null);

const filteredDomains = computed(() => {
  return domains.value.filter((d) => {
    const term = search.value.trim().toLowerCase();
    const matchSearch = !term || d.domain_name.toLowerCase().includes(term) || (d.notes && d.notes.toLowerCase().includes(term));
    const matchCat = categoryFilter.value === 'all' || d.category === categoryFilter.value;
    return matchSearch && matchCat;
  });
});

onMounted(async () => {
  await domainsStore.fetchDomains();
  initSortable();
});

function initSortable() {
  nextTick(() => {
    const el = document.querySelector('.domains-table .el-table__body-wrapper tbody');
    if (!el) return;
    Sortable.create(el, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: async ({ newIndex, oldIndex }) => {
        if (newIndex === oldIndex) return;
        
        // The dragged item is now at newIndex in the DOM, but we need to figure out the ID order.
        // We look at the actual DOM nodes to get the new order of IDs.
        const rowElements = Array.from(el.querySelectorAll('tr.el-table__row'));
        const newOrderIds = rowElements.map(row => {
          // Find the hidden span containing the ID
          const idSpan = row.querySelector('.row-id');
          return idSpan ? Number(idSpan.textContent) : null;
        }).filter(id => id !== null);

        // Filter out anything not in the current view just to be safe, but since it's the whole table, newOrderIds has the visible ones.
        // Wait, if table is filtered/sorted, drag and drop might mess up. So we only allow drag if not filtered/sorted.
        if (search.value || categoryFilter.value !== 'all') {
          ElMessage.warning('搜索或筛选状态下无法进行拖拽排序。');
          await domainsStore.fetchDomains(); // Re-fetch to reset view
          return;
        }

        try {
          await domainsStore.reorderDomains(newOrderIds);
        } catch (error) {
          ElMessage.error("排序保存失败: " + (error.response?.data?.message || error.message));
          await domainsStore.fetchDomains();
        }
      }
    });
  });
}

function openAdd() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogOpen.value = true;
}

function openEdit(domain) {
  editingId.value = domain.id;
  Object.assign(form, { ...domain });
  dialogOpen.value = true;
}

async function save() {
  if (!form.domain_name.trim()) {
    ElMessage.error("请输入域名");
    return;
  }
  
  saving.value = true;
  try {
    if (editingId.value) {
      await domainsStore.updateDomain(editingId.value, form);
      ElMessage.success("域名已更新");
    } else {
      await domainsStore.addDomain(form);
      ElMessage.success("域名已添加，系统已在后台自动获取相关信息");
    }
    dialogOpen.value = false;
  } catch (error) {
    ElMessage.error(error.response?.data?.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

async function refresh(domain) {
  try {
    await domainsStore.refreshDomain(domain.id);
    ElMessage.success(`域名 ${domain.domain_name} 信息已刷新`);
  } catch (error) {
    ElMessage.error(error.response?.data?.message || "刷新失败");
  }
}

function remove(domain) {
  ElMessageBox.confirm(`确定要删除域名 "${domain.domain_name}" 吗？`, "删除确认", {
    type: "warning",
    confirmButtonText: "删除",
    confirmButtonClass: "el-button--danger"
  }).then(async () => {
    try {
      await domainsStore.deleteDomain(domain.id);
      ElMessage.success("已删除");
    } catch (error) {
      ElMessage.error("删除失败");
    }
  }).catch(() => {});
}

function getDaysRemaining(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-content">
        <h1>域名管理</h1>
        <p class="subtitle">管理您的域名资产与到期时间</p>
      </div>
      <div class="header-actions">
        <el-input v-model="search" placeholder="搜索域名..." :prefix-icon="Search" clearable style="width: 200px" />
        <el-select v-model="categoryFilter" placeholder="分类筛选" style="width: 150px; margin-right: 12px;">
          <el-option label="全部分类" value="all" />
          <el-option v-for="cat in categoryOptions" :key="cat" :label="cat" :value="cat" />
        </el-select>
        <el-button @click="categoryDialogOpen = true">管理分类</el-button>
        <el-button :icon="Setting" @click="openDict">自动匹配字典</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">添加域名</el-button>
      </div>
    </header>

    <div class="domains-content" v-loading="loading">
      <el-table :data="filteredDomains" class="service-table domains-table" row-key="id" ref="tableRef" :default-sort="{prop: 'sort_order', order: 'ascending'}">
        <el-table-column width="50" align="center">
          <template #default="{ row }">
            <span style="display: none" class="row-id">{{ row.id }}</span>
            <el-icon class="drag-handle" style="cursor: grab; font-size: 18px; color: #909399;"><Operation /></el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="domain_name" label="域名" min-width="150" />
        <el-table-column prop="category" label="分类" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small" effect="dark">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expiration_date" label="到期时间" sortable min-width="180">
          <template #default="{ row }">
            <template v-if="row.expiration_date">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>{{ new Date(row.expiration_date).toLocaleDateString() }}</span>
                <el-tag v-if="getDaysRemaining(row.expiration_date) !== null" 
                  size="small" 
                  effect="dark"
                  :type="getDaysRemaining(row.expiration_date) < 30 ? 'danger' : getDaysRemaining(row.expiration_date) < 60 ? 'warning' : 'success'">
                  剩 {{ getDaysRemaining(row.expiration_date) }} 天
                </el-tag>
              </div>
            </template>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="registrar_name" label="注册商" min-width="150">
          <template #default="{ row }">
            <a v-if="row.registrar_url" :href="row.registrar_url" target="_blank" class="provider-link" :title="row.registrar_name">
              <span class="truncate-text">{{ row.registrar_name || '前往控制台' }}</span> <el-icon style="flex-shrink: 0"><Link /></el-icon>
            </a>
            <div v-else-if="row.registrar_name" class="truncate-text" :title="row.registrar_name">{{ row.registrar_name }}</div>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="dns_provider_name" label="DNS 托管商" min-width="180">
          <template #default="{ row }">
            <a v-if="row.dns_provider_url" :href="row.dns_provider_url" target="_blank" class="provider-link-container">
              <div class="dns-list">
                <div v-for="dns in (row.dns_provider_name || '前往控制台').split(',').map(s=>s.trim()).filter(Boolean)" :key="dns" class="truncate-text" :title="dns">
                  {{ dns }}
                </div>
              </div>
              <el-icon style="flex-shrink: 0"><Connection /></el-icon>
            </a>
            <template v-else-if="row.dns_provider_name">
              <div class="dns-list">
                <div v-for="dns in row.dns_provider_name.split(',').map(s=>s.trim()).filter(Boolean)" :key="dns" class="truncate-text" :title="dns">
                  {{ dns }}
                </div>
              </div>
            </template>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right" fixed="right">
          <template #default="{ row }">
            <div class="entry-links">
              <el-button circle :icon="Refresh" @click="refresh(row)" title="刷新状态" />
              <el-button circle :icon="EditPen" @click="openEdit(row)" title="编辑" />
              <el-button circle type="danger" :icon="Delete" @click="remove(row)" title="删除" />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogOpen" :title="editingId ? '编辑域名' : '添加域名'" width="600px" class="service-dialog">
      <el-form :model="form" label-width="120px" @submit.prevent>
        <el-form-item label="域名" required>
          <el-input v-model="form.domain_name" placeholder="example.com" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" allow-create filterable clearable placeholder="选择或输入新分类" style="width: 100%;">
            <el-option v-for="cat in categoryOptions" :key="cat" :label="cat" :value="cat" />
          </el-select>
        </el-form-item>
        
        <el-divider>详细信息 (可选)</el-divider>
        <div class="form-tip"><el-icon><InfoFilled /></el-icon> 新增时只需填写域名，系统将自动尝试获取以下信息。</div>

        <el-form-item label="到期时间">
          <el-date-picker v-model="form.expiration_date" type="date" placeholder="选择日期" style="width: 100%;" />
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="注册商" label-width="80px">
              <el-input v-model="form.registrar_name" placeholder="名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="控制台链接" label-width="90px">
              <el-input v-model="form.registrar_url" placeholder="https://..." />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="DNS 服务" label-width="80px">
              <el-input v-model="form.dns_provider_name" placeholder="名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="控制台链接" label-width="90px">
              <el-input v-model="form.dns_provider_url" placeholder="https://..." />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="相关备注..." />
        </el-form-item>

        <el-form-item label="自动更新">
          <el-switch v-model="form.auto_update" :active-value="1" :inactive-value="0" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px;">每天自动拉取 WHOIS 信息</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dictDialogOpen" title="自动匹配字典" width="700px" class="service-dialog">
      <div class="form-tip" style="margin-bottom: 20px;"><el-icon><InfoFilled /></el-icon> 自动匹配时，只要 WHOIS 中的名字包含了下面配置的任一关键字（逗号分隔），就会自动填入对应的控制台链接。</div>
      
      <el-divider>注册商 (Registrar)</el-divider>
      <div v-for="(item, i) in dictForm.registrars" :key="'reg'+i" style="display: flex; gap: 10px; margin-bottom: 10px;">
        <el-input v-model="item.keywords" placeholder="关键字（英文逗号分隔）" style="flex: 1;" />
        <el-input v-model="item.url" placeholder="控制台链接" style="flex: 2;" />
        <el-button type="danger" :icon="Delete" @click="dictForm.registrars.splice(i, 1)" plain />
      </div>
      <el-button type="primary" :icon="Plus" plain @click="dictForm.registrars.push({keywords: '', url: ''})" size="small">添加注册商规则</el-button>

      <el-divider style="margin-top: 30px;">DNS 托管商</el-divider>
      <div v-for="(item, i) in dictForm.dnsProviders" :key="'dns'+i" style="display: flex; gap: 10px; margin-bottom: 10px;">
        <el-input v-model="item.keywords" placeholder="关键字（英文逗号分隔）" style="flex: 1;" />
        <el-input v-model="item.url" placeholder="控制台链接" style="flex: 2;" />
        <el-button type="danger" :icon="Delete" @click="dictForm.dnsProviders.splice(i, 1)" plain />
      </div>
      <el-button type="primary" :icon="Plus" plain @click="dictForm.dnsProviders.push({keywords: '', url: ''})" size="small">添加 DNS 规则</el-button>

      <template #footer>
        <el-button @click="dictDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="dictSaving" @click="saveDict">保存设置</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="categoryDialogOpen" title="分类管理" width="400px" class="service-dialog">
      <div v-if="!categoryOptions.length" class="text-muted" style="text-align: center; padding: 20px;">暂无分类</div>
      <div v-for="cat in categoryOptions" :key="cat" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--el-border-color-lighter);">
        <span>{{ cat }}</span>
        <div class="entry-links" style="display: flex; gap: 10px;">
          <el-button circle :icon="EditPen" @click="promptRenameCategory(cat)" title="重命名" size="small" />
          <el-button circle type="danger" :icon="Delete" @click="promptDeleteCategory(cat)" title="删除" size="small" />
        </div>
      </div>
      <template #footer>
        <el-button @click="categoryDialogOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}
.header-content h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-main);
}
.subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-muted);
}
.header-actions {
  display: flex;
  gap: 12px;
}
.domains-content {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.text-muted {
  color: var(--text-muted);
}
.provider-link {
  color: var(--primary-color);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}
.provider-link:hover {
  text-decoration: underline;
}
.provider-link-container {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-color);
  text-decoration: none;
  overflow: hidden;
}
.provider-link-container:hover {
  text-decoration: underline;
}
.dns-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}
.truncate-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
  display: block;
}
.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 20px;
  background: var(--bg-body);
  padding: 10px 15px;
  border-radius: 6px;
  line-height: 1.5;
}
</style>
