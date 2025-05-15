import { EMessageStatus } from "src/app/_shared/const/enums";

export interface Message {
    id: string;
    fromUserId: string;
    toUserId: string;
    text: string;
    date: Date;
    isClientToServer: boolean;
    status: EMessageStatus;
}