"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDate = formatDate;
exports.addDays = addDays;
exports.addHours = addHours;
exports.addMinutes = addMinutes;
exports.isExpired = isExpired;
exports.getUnixTimestamp = getUnixTimestamp;
function formatDate(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString();
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
function addHours(date, hours) {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
}
function addMinutes(date, minutes) {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
}
function isExpired(date, now = new Date()) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d < now;
}
function getUnixTimestamp(date) {
    return Math.floor((date || new Date()).getTime() / 1000);
}
//# sourceMappingURL=date.js.map