const BEIJING_TIME_ZONE = "Asia/Shanghai";
const BEIJING_OFFSET = "+08:00";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function getBeijingParts(date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: BEIJING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = {};
  parts.forEach((item) => {
    if (item.type !== "literal") {
      map[item.type] = item.value;
    }
  });
  return {
    year: toInt(map.year),
    month: toInt(map.month),
    day: toInt(map.day),
    hour: toInt(map.hour),
    minute: toInt(map.minute),
    second: toInt(map.second),
  };
}

export function formatDateTimeBeijing(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = getBeijingParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

export function getBeijingNowForPicker() {
  const parts = getBeijingParts(new Date());
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function buildBeijingOffsetDateTime(date, timeValue) {
  if (!date) return "";
  const [inputHour, inputMinute] = String(timeValue || "00:00").split(":");
  const hour = pad2(toInt(inputHour));
  const minute = pad2(toInt(inputMinute));
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}T${hour}:${minute}:00${BEIJING_OFFSET}`;
}

export function datetimeLocalToBeijingOffset(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00${BEIJING_OFFSET}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return `${raw}${BEIJING_OFFSET}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const parts = getBeijingParts(parsed);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${BEIJING_OFFSET}`;
}
