export interface Usage {
    activeDays: DailyUsage[];
}

export interface DailyUsage {
    day: string;
    saved: boolean;
}