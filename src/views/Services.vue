<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  AlarmClock,
  Avatar,
  Bell,
  Box,
  CircleCheck,
  ArrowDown,
  ArrowUp,
  Camera,
  Calendar,
  Coin,
  Connection,
  CopyDocument,
  Cpu,
  DataBoard,
  DataAnalysis,
  Delete,
  Document,
  Download,
  EditPen,
  Folder,
  FolderOpened,
  Files,
  Film,
  Grid,
  Headset,
  House,
  Key,
  Link,
  Lock,
  Management,
  Message,
  Monitor,
  Odometer,
  Operation,
  PieChart,
  Picture,
  Platform,
  Plus,
  Refresh,
  Search,
  Setting,
  Share,
  ShoppingCart,
  Tickets,
  Tools,
  User,
  UserFilled,
  VideoCamera,
  VideoCameraFilled,
  VideoPlay,
  Warning,
  InfoFilled,
  Wallet,
  Upload,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import { useRoute, useRouter } from "vue-router";
import { serviceApi } from "../api";
import { readServiceCategories } from "../serviceCategories";

const services = ref([]);
const loading = ref(false);
const saving = ref(false);
const checkingId = ref(null);
const dialogOpen = ref(false);
const editingId = ref(null);
const search = ref("");
const statusFilter = ref("all");
const categoryOptions = ref(readServiceCategories());
const route = useRoute();
const router = useRouter();
const statusOptions = [
  { value: 0, label: "离线", type: "info" },
  { value: 1, label: "运行中", type: "success" },
  { value: 2, label: "告警", type: "warning" },
  { value: 3, label: "异常", type: "danger" },
  { value: 4, label: "维护中", type: "info" },
];
const versionTypes = [
  { value: 0, label: "手动维护" },
  { value: 1, label: "Git 标签" },
  { value: 2, label: "GitHub Release" },
  { value: 3, label: "package.json" },
  { value: 4, label: "Docker 镜像" },
  { value: 5, label: "Git 提交" },
];
const versionStatuses = [
  { value: 0, label: "未知" },
  { value: 1, label: "已是最新" },
  { value: 2, label: "有可用更新" },
  { value: 3, label: "检查失败" },
];
const dockerStatuses = [
  { value: 0, label: "未知" },
  { value: 1, label: "运行中" },
  { value: 2, label: "已停止" },
  { value: 3, label: "已退出" },
  { value: 4, label: "不健康" },
];
const serviceIcons = [
  { value: "Monitor", label: "服务", component: Monitor },
  { value: "Platform", label: "平台", component: Platform },
  { value: "Avatar", label: "账户", component: Avatar },
  { value: "UserFilled", label: "用户组", component: UserFilled },
  { value: "DataAnalysis", label: "监控", component: DataAnalysis },
  { value: "DataBoard", label: "数据看板", component: DataBoard },
  { value: "PieChart", label: "图表", component: PieChart },
  { value: "Odometer", label: "仪表盘", component: Odometer },
  { value: "Cpu", label: "计算", component: Cpu },
  { value: "Connection", label: "网络", component: Connection },
  { value: "House", label: "首页", component: House },
  { value: "Grid", label: "应用", component: Grid },
  { value: "Folder", label: "文件", component: Folder },
  { value: "FolderOpened", label: "目录", component: FolderOpened },
  { value: "Picture", label: "媒体", component: Picture },
  { value: "Camera", label: "相机", component: Camera },
  { value: "Calendar", label: "日历", component: Calendar },
  { value: "Lock", label: "安全", component: Lock },
  { value: "Key", label: "密钥", component: Key },
  { value: "User", label: "用户", component: User },
  { value: "Message", label: "消息", component: Message },
  { value: "Bell", label: "通知", component: Bell },
  { value: "Headset", label: "客服", component: Headset },
  { value: "Link", label: "链接", component: Link },
  { value: "Share", label: "分享", component: Share },
  { value: "Document", label: "文档", component: Document },
  { value: "CopyDocument", label: "副本", component: CopyDocument },
  { value: "Files", label: "文件组", component: Files },
  { value: "Download", label: "下载", component: Download },
  { value: "Upload", label: "上传", component: Upload },
  { value: "AlarmClock", label: "定时", component: AlarmClock },
  { value: "Film", label: "影片", component: Film },
  { value: "VideoCameraFilled", label: "视频服务", component: VideoCameraFilled },
  { value: "Wallet", label: "钱包", component: Wallet },
  { value: "VideoCamera", label: "视频", component: VideoCamera },
  { value: "ShoppingCart", label: "商店", component: ShoppingCart },
  { value: "Coin", label: "财务", component: Coin },
  { value: "Tools", label: "工具", component: Tools },
  { value: "Setting", label: "设置", component: Setting },
  { value: "Management", label: "管理", component: Management },
  { value: "Tickets", label: "工单", component: Tickets },
  { value: "Box", label: "容器", component: Box },
  { value: "ArrowDown", label: "下行", component: ArrowDown },
  { value: "ArrowUp", label: "上行", component: ArrowUp },
  { value: "Operation", label: "运维", component: Operation },
  { value: "VideoPlay", label: "播放", component: VideoPlay },
  { value: "Goods", label: "商品", component: ShoppingCart },
  { value: "TrendCharts", label: "趋势", component: Odometer },
  { value: "CircleCheck", label: "成功", component: CircleCheck },
  { value: "Warning", label: "警告", component: Warning },
  { value: "InfoFilled", label: "信息", component: InfoFilled },
];
const serviceIconMap = Object.fromEntries(
  serviceIcons.map((item) => [item.value, item.component]),
);
const emptyForm = () => ({
  name: "",
  sort_order: 1,
  description: "",
  category: "",
  icon: "Monitor",
  status: 0,
  github_url: "",
  lan_url: "",
  wan_url: "",
  local_path: "",
  version_type: 0,
  local_version: "",
  remote_version: "",
  version_status: 0,
  docker_enabled: false,
  docker_name: "",
  docker_image: "",
  docker_status: 0,
  docker_health: "",
  docker_restart_count: 0,
  frp_username: "",
  frp_password: "",
  favorite: false,
  notes: "",
});
const form = reactive(emptyForm());
const filteredServices = computed(() =>
  services.value.filter((service) => {
    const term = search.value.trim().toLowerCase();
    const matchesTerm =
      !term ||
      [service.name, service.description, service.category].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      );
    return (
      matchesTerm &&
      (statusFilter.value === "all" ||
        service.status === Number(statusFilter.value))
    );
  }),
);
const formCategoryOptions = computed(() => {
  const current = String(form.category || "").trim();
  return current && !categoryOptions.value.includes(current)
    ? [current, ...categoryOptions.value]
    : categoryOptions.value;
});
function statusMeta(value) {
  return (
    statusOptions.find((option) => option.value === value) || statusOptions[0]
  );
}
function serviceIcon(icon) {
  return serviceIconMap[icon] || Monitor;
}
function resetForm(service = null) {
  Object.assign(form, emptyForm(), service || {});
}
function openCreate() {
  editingId.value = null;
  resetForm();
  form.sort_order = services.value.length + 1;
  dialogOpen.value = true;
}
function openEdit(service) {
  editingId.value = service.id;
  resetForm(service);
  form.sort_order = servicePosition(service) + 1;
  dialogOpen.value = true;
}
function openEditFromRoute() {
  const id = Number(route.query.edit);
  if (!Number.isInteger(id)) return;
  const service = services.value.find((item) => item.id === id);
  if (service) {
    openEdit(service);
    router.replace({ query: { ...route.query, edit: undefined } });
  }
}
async function loadServices() {
  loading.value = true;
  try {
    services.value = await serviceApi.list();
    openEditFromRoute();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    loading.value = false;
  }
}
async function saveService() {
  if (!form.name.trim()) return ElMessage.warning("请输入服务名称");
  const desiredPosition = Number(form.sort_order);
  const maxPosition = services.value.length + (editingId.value ? 0 : 1);
  if (!Number.isInteger(desiredPosition) || desiredPosition < 1 || desiredPosition > maxPosition) {
    return ElMessage.warning(`排序号请输入 1-${maxPosition} 的整数`);
  }
  saving.value = true;
  try {
    const payload = { ...form };
    delete payload.sort_order;
    const saved = editingId.value
      ? await serviceApi.update(editingId.value, payload)
      : await serviceApi.create(payload);
    const index = services.value.findIndex(
      (service) => service.id === saved.id,
    );
    if (index >= 0) services.value.splice(index, 1, saved);
    else services.value.push(saved);
    const ids = services.value.map((item) => item.id);
    const savedIndex = ids.indexOf(saved.id);
    const targetIndex = desiredPosition - 1;
    if (savedIndex !== targetIndex) {
      ids.splice(savedIndex, 1);
      ids.splice(targetIndex, 0, saved.id);
      services.value = await serviceApi.reorder(ids);
    }
    dialogOpen.value = false;
    ElMessage.success(editingId.value ? "服务已更新" : "服务已添加");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    saving.value = false;
  }
}
function servicePosition(service) {
  return services.value.findIndex((item) => item.id === service.id);
}
async function removeService(service) {
  try {
    await ElMessageBox.confirm(
      `确定删除“${service.name}”吗？此操作不可恢复。`,
      "删除服务",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
    await serviceApi.remove(service.id);
    services.value = services.value.filter((item) => item.id !== service.id);
    ElMessage.success("服务已删除");
  } catch (error) {
    if (error !== "cancel" && error !== "close")
      ElMessage.error(error.message || "删除失败");
  }
}
async function checkVersion(service) {
  checkingId.value = service.id;
  try {
    const updated = await serviceApi.checkVersion(service.id);
    const index = services.value.findIndex((item) => item.id === updated.id);
    if (index >= 0) services.value.splice(index, 1, updated);
    ElMessage.success("版本检测完成");
  } catch (error) {
    await loadServices();
    ElMessage.error(error.message || "版本检测失败");
  } finally {
    checkingId.value = null;
  }
}
onMounted(loadServices);
watch(() => route.query.edit, openEditFromRoute);
</script>

<template>
  <div class="page-head services-page-head">
    <div>
      <div class="eyebrow">WORKSPACE · SERVICES</div>
      <h1>我的服务</h1>
      <p>集中管理 HomeLab 服务、访问地址和版本信息。</p>
    </div>
    <el-button type="primary" @click="openCreate"
      ><el-icon><Plus /></el-icon>添加服务</el-button
    >
  </div>
  <section class="table-panel">
    <div class="table-toolbar">
      <div class="table-search">
        <el-icon><Search /></el-icon
        ><input v-model="search" placeholder="搜索服务" />
      </div>
      <el-select
        v-model="statusFilter"
        class="status-filter"
        popper-class="homelab-select-popper"
        aria-label="按状态筛选"
        ><el-option label="全部状态" value="all" /><el-option
          v-for="item in statusOptions"
          :key="item.value"
          :label="item.label"
          :value="String(item.value)" /></el-select
      ><el-button circle title="刷新" :loading="loading" @click="loadServices"
        ><el-icon><Refresh /></el-icon></el-button
      ><span class="table-count">{{ filteredServices.length }} 个服务</span>
    </div>
    <el-table
      v-loading="loading"
      :data="filteredServices"
      class="service-table"
      empty-text="暂无服务，请先添加一项服务。"
      ><el-table-column label="排序" width="70" fixed="left"
        ><template #default="{ row }">{{ servicePosition(row) + 1 }}</template></el-table-column
      ><el-table-column label="服务" min-width="220"
        ><template #default="{ row }"
          ><div class="project-cell">
            <div class="mini-logo"><el-icon><component :is="serviceIcon(row.icon)" /></el-icon></div>
            <div>
              <strong>{{ row.name }}</strong
              ><span>{{ row.description || "未填写描述" }}</span>
            </div>
          </div></template
        ></el-table-column
      ><el-table-column label="分类" width="120"
        ><template #default="{ row }"
          ><span class="category">{{
            row.category || "未分类"
          }}</span></template
        ></el-table-column
      ><el-table-column label="状态" width="130"
        ><template #default="{ row }"
          ><el-tag
            :type="statusMeta(row.status).type"
            effect="dark"
            size="small"
            >{{ statusMeta(row.status).label }}</el-tag
          ></template
        ></el-table-column
      ><el-table-column label="版本" min-width="150"
        ><template #default="{ row }"
          ><span class="version-cell"
            >{{ row.local_version || "-" }}
            <b v-if="row.version_status === 2"
              >→ {{ row.remote_version || "?" }}</b
            ></span
          ></template
        ></el-table-column
      ><el-table-column label="Docker" min-width="150"
        ><template #default="{ row }"
          ><span class="docker-cell">{{
            row.docker_enabled ? row.docker_name || "已启用" : "未配置"
          }}</span></template
        ></el-table-column
      ><el-table-column label="操作" width="170" fixed="right"
        ><template #default="{ row }"
          ><div class="entry-links">
            <el-button
              circle
              title="检测版本"
              :loading="checkingId === row.id"
              @click="checkVersion(row)"
              ><el-icon><VideoPlay /></el-icon></el-button
            ><el-button circle title="编辑" @click="openEdit(row)"
              ><el-icon><EditPen /></el-icon></el-button
            ><el-button
              circle
              title="删除"
              type="danger"
              @click="removeService(row)"
              ><el-icon><Delete /></el-icon
            ></el-button></div></template></el-table-column
    ></el-table>
  </section>
  <el-dialog
    v-model="dialogOpen"
    :title="editingId ? '编辑服务' : '添加服务'"
    width="760px"
    destroy-on-close
    class="service-dialog"
    ><el-form label-position="top" @submit.prevent="saveService"
      ><div class="form-grid">
        <el-form-item label="服务名称" required
          ><el-input
            v-model="form.name"
            placeholder="例如：Uptime Kuma" /></el-form-item
        ><el-form-item label="排序序号"
          ><el-input-number
            v-model="form.sort_order"
            :min="1"
            :max="services.length + (editingId ? 0 : 1)"
            :step="1"
            controls-position="right"
            class="sort-order-input"
            aria-label="服务排序序号" /></el-form-item
        ><el-form-item label="分类"
          ><el-select v-model="form.category" clearable filterable placeholder="选择分类"
            ><el-option v-for="category in formCategoryOptions" :key="category" :label="category" :value="category" /></el-select></el-form-item
        ><el-form-item label="服务图标" class="icon-picker-field"
          ><div class="icon-picker">
            <button v-for="item in serviceIcons" :key="item.value" type="button" class="icon-choice" :class="{ selected: form.icon === item.value }" :title="item.label" @click="form.icon = item.value"><el-icon><component :is="item.component" /></el-icon></button>
          </div></el-form-item
        ><el-form-item label="服务状态"
          ><el-select v-model="form.status" popper-class="homelab-select-popper"
            ><el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="描述"
          ><el-input
            v-model="form.description"
            placeholder="服务的用途说明" /></el-form-item
        ><el-form-item label="内网地址"
          ><el-input
            v-model="form.lan_url"
            placeholder="192.168.1.10:3001" /></el-form-item
        ><el-form-item label="公网地址"
          ><el-input
            v-model="form.wan_url"
            placeholder="uptime.example.com 或公网 IP" /></el-form-item
        ><el-form-item label="FRP 用户名"
          ><el-input
            v-model="form.frp_username"
            placeholder="frp-client" /></el-form-item
        ><el-form-item label="FRP 密码"
          ><el-input
            v-model="form.frp_password"
            type="text"
            placeholder="请输入 FRP 密码" /></el-form-item
        ><el-form-item label="GitHub 地址"
          ><el-input
            v-model="form.github_url"
            placeholder="https://github.com/org/repo" /></el-form-item
        ><el-form-item label="本地路径"
          ><el-input
            v-model="form.local_path"
            placeholder="/opt/services/uptime-kuma" /></el-form-item
        ><el-form-item label="当前版本"
          ><el-input
            v-model="form.local_version"
            placeholder="1.23.15" /></el-form-item
        ><el-form-item label="最新版本"
          ><el-input
            v-model="form.remote_version"
            placeholder="1.23.16" /></el-form-item
        ><el-form-item label="版本来源"
          ><el-select
            v-model="form.version_type"
            popper-class="homelab-select-popper"
            ><el-option
              v-for="item in versionTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="版本状态"
          ><el-select
            v-model="form.version_status"
            popper-class="homelab-select-popper"
            ><el-option
              v-for="item in versionStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="Docker"
          ><el-switch
            v-model="form.docker_enabled"
            active-text="已启用"
            inactive-text="未启用" /></el-form-item
        ><el-form-item label="Docker 容器"
          ><el-input
            v-model="form.docker_name"
            placeholder="uptime-kuma"
            :disabled="!form.docker_enabled" /></el-form-item
        ><el-form-item label="Docker 镜像"
          ><el-input
            v-model="form.docker_image"
            placeholder="louislam/uptime-kuma"
            :disabled="!form.docker_enabled" /></el-form-item
        ><el-form-item label="Docker 状态"
          ><el-select
            v-model="form.docker_status"
            popper-class="homelab-select-popper"
            :disabled="!form.docker_enabled"
            ><el-option
              v-for="item in dockerStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="重启次数"
          ><el-input-number
            v-model="form.docker_restart_count"
            :min="0"
            :disabled="!form.docker_enabled" /></el-form-item
        ><el-form-item label="收藏"
          ><el-switch
            v-model="form.favorite"
            active-text="已置顶"
            inactive-text="普通"
        /></el-form-item>
      </div>
      <el-form-item label="备注"
        ><el-input
          v-model="form.notes"
          type="textarea"
          :rows="3"
          placeholder="运维说明、凭据存放位置、维护信息等" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="dialogOpen = false">取消</el-button
      ><el-button type="primary" :loading="saving" @click="saveService">{{
        editingId ? "保存修改" : "添加服务"
      }}</el-button></template
    ></el-dialog
  >
</template>
<style src="../styles/services.css"></style>
