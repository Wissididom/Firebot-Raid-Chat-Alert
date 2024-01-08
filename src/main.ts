import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import * as WebSocket from "ws";

const EVENTSUB_WSS_URL = "wss://eventsub.wss.twitch.tv/ws";

let alreadySubscribedToEvent = false;
let exponentialBackoff = 0;

interface Params {
  message: string;
  sendAs: ("streamer" | "bot")[];
}

const script: Firebot.CustomScript<Params> = {
  getScriptManifest: () => {
    return {
      name: "Firebot Raid Chat Alert",
      description:
        "A custom script to post the raid target in chat on an outgoing raid. Only needed as long as the Trigger does not exist inbuilt into Firebot",
      author: "Wissididom",
      version: "1.0",
      firebotVersion: "5",
      startupOnly: true,
    };
  },
  getDefaultParameters: () => {
    return {
      message: {
        type: "string",
        default:
          "<to_broadcaster_user_name>: https://www.twitch.tv/<to_broadcaster_user_login>",
        description: "Format",
        secondaryDescription:
          "The Format you want the message to look like when posting to chat. Allowed Variables: <from_broadcaster_user_id>, <from_broadcaster_user_login>, <from_broadcaster_user_name>, <to_broadcaster_user_id>, <to_broadcaster_user_login>, <to_broadcaster_user_name>, <viewers>",
      },
      sendAs: {
        type: "enum",
        default: "bot",
        description: "Send the chat message as",
        secondaryDescription: "'bot' has no effect if no bot user is set up",
        options: ["streamer", "bot"],
      },
    };
  },
  run: (runRequest) => {
    const { logger } = runRequest.modules;
    let keepaliveTimeoutSeconds = {
      start: 0,
      end: 0,
      interval: 0,
    };
    let keepaliveTimeoutInterval = setInterval(() => {
      if (
        keepaliveTimeoutSeconds.start > 0 &&
        keepaliveTimeoutSeconds.end > 0
      ) {
        if (keepaliveTimeoutSeconds.end - keepaliveTimeoutSeconds.start > 10)
          script.run(runRequest);
      }
    }, 1000);
    let client = new WebSocket(EVENTSUB_WSS_URL);
    let onopen = (event: any) => {
      logger.info("[Firebot Raid Chat Alert] EventSub connection established!");
      exponentialBackoff = 0;
    };
    let onmessage = async (event: any) => {
      let data = JSON.parse(event.data);
      if (data.metadata?.message_type == "session_welcome") {
        logger.info(
          "[Firebot Raid Chat Alert] session_welcome: " + JSON.stringify(data),
        );
        if (alreadySubscribedToEvent) {
          return;
        }
        let id = data.payload.session.id;
        keepaliveTimeoutSeconds.interval =
          data.payload.session.keepalive_timeout_seconds;
        // https://dev.twitch.tv/docs/api/reference/#create-eventsub-subscription
        let apiClient = runRequest.modules.twitchApi.getClient();
        await apiClient.eventSub.createSubscription(
          "channel.raid",
          "1",
          {
            from_broadcaster_user_id:
              runRequest.firebot.accounts.streamer.userId,
          },
          { method: "websocket", session_id: id },
          runRequest.firebot.accounts.streamer.userId,
        );
        alreadySubscribedToEvent = true;
      } else if (data.metadata?.message_type == "session_keepalive") {
        logger.info(
          "[Firebot Raid Chat Alert] session_keepalive: " +
            JSON.stringify(data),
        );
      } else if (data.metadata?.message_type == "session_reconnect") {
        logger.info(
          "[Firebot Raid Chat Alert] session_reconnect: " +
            JSON.stringify(data),
        );
        logger.info(
          `[Firebot Raid Chat Alert] Reconnecting to ${data.payload.session.reconnect_url}`,
        );
        client = new WebSocket(data.payload.session.reconnect_url);
        client.onopen = onopen;
        client.onmessage = onmessage;
        client.onclose = onclose;
        client.onerror = onerror;
      } else if (data.payload?.subscription?.type == "channel.raid") {
        logger.info(
          "[Firebot Raid Chat Alert] channel.raid: " + JSON.stringify(data),
        );
        let message = runRequest.parameters.message
          .replace(
            "<from_broadcaster_user_id>",
            data.payload.event.from_broadcaster_user_id,
          )
          .replace(
            "<from_broadcaster_user_login>",
            data.payload.event.from_broadcaster_user_login,
          )
          .replace(
            "<from_broadcaster_user_name>",
            data.payload.event.from_broadcaster_user_name,
          )
          .replace(
            "<to_broadcaster_user_id>",
            data.payload.event.to_broadcaster_user_id,
          )
          .replace(
            "<to_broadcaster_user_login>",
            data.payload.event.to_broadcaster_user_login,
          )
          .replace(
            "<to_broadcaster_user_name>",
            data.payload.event.to_broadcaster_user_name,
          )
          .replace("<viewers>", data.payload.event.viewers);
        let sendAs = runRequest.parameters.sendAs;
        logger.info(`Raid-Message: ${message} (Send As: ${sendAs})`);
        await runRequest.modules.twitchChat.sendChatMessage(
          message,
          null,
          sendAs,
        );
      } else {
        logger.info(
          "[Firebot Raid Chat Alert] EventSub Data: " + JSON.stringify(data),
        );
      }
      keepaliveTimeoutSeconds.start = Date.now() / 1000;
      keepaliveTimeoutSeconds.end =
        keepaliveTimeoutSeconds.start + keepaliveTimeoutSeconds.interval;
    };
    let onclose = (event: any) => {
      logger.info(
        `[Firebot Raid Chat Alert] EventSub connection closed! (Code: ${event.code}; Reason: ${event.reason})`,
      );
      if (!event.wasClean) {
        logger.info(
          `[Firebot Raid Chat Alert] Connection didn't close in a clean manner! Maybe just the connection was lost! Trying to reconnect... (exponential backoff: ${exponentialBackoff})`,
        );
        alreadySubscribedToEvent = false;
        if (exponentialBackoff == 0) {
          script.run(runRequest);
          exponentialBackoff = 100;
        } else {
          setTimeout(() => {
            script.run(runRequest);
          }, exponentialBackoff);
        }
        exponentialBackoff *= 2;
      }
    };
    let onerror = (event: any) => {
      logger.info(`[Firebot Raid Chat Alert] EventSub connection errored!`);
    };
    client.onopen = onopen;
    client.onmessage = onmessage;
    client.onclose = onclose;
    client.onerror = onerror;
  },
};

export default script;
