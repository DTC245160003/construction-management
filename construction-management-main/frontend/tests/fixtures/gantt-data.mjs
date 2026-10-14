export const makeTasks = (count = 500) => Array.from({ length: count }, (_, index) => ({
    id: index + 1, name: index < 2 ? "Tên trùng" : `Công việc ${index + 1}`,
    es: index % 80, ef: index % 80 + (index % 5) + 1,
    ls: index % 80, lf: index % 80 + (index % 5) + 1,
    duration_days: (index % 5) + 1, slack: index % 3, isCritical: index % 3 === 0,
    percentComplete: index % 101
}));
