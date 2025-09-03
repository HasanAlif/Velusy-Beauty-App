//import { NotificationType, Notification, User } from "../../models";
import admin from "./firebaseAdmin";

interface BulkNotificationInput {
  userIds: string[]; // List of users to notify
  title: string;
  body: string;
  //type: NotificationType;
  postId?: string; // Optional, useful for linking to post
}

// Send notification to multiple users
export const sendBulkNotification = async ({
  userIds,
  title,
  body,
  //type,
  postId,
}: BulkNotificationInput): Promise<void> => {
  if (userIds.length === 0) return;

  // await Promise.all(
  //   userIds.map((userId) => {
  //     return sendSingleNotification({
  //       userId,
  //       title,
  //       body,
  //       type,
  //       postId,
  //     });
  //   })
  // );
};

// Send notification to a single user
export const sendSingleNotification = async (payload: {
  userId: string;
  title: string;
  body: string;
  //type: NotificationType;
  postId?: string;
}): Promise<void> => {
  //const notification = await Notification.create(payload);
  // find user
  //const user = await User.findById(payload.userId).select('_id fcmToken');
  // if (!user) {
  //   throw new Error("User not found");
  // }
  // if (user?.fcmToken) {
  //   await pushNotification({
  //     fcmToken: user.fcmToken,
  //     title: payload.title,
  //     body: payload.body,
  //     notificationId: notification._id,
  //   });
  // }
};

// push notification to user
export const pushNotification = async (payload: {
  fcmToken: string;
  title: string;
  body: string;
  notificationId: string;
}): Promise<void> => {
  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
      notificationId: payload.notificationId,
    },
    token: payload.fcmToken,
  };
  await admin.messaging().send(message);
};
