import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import * as WebSocket from "ws";
import axios from "axios";

const CLIENT_ID = "umhhyrvkdriayr0psc3ttmsnq2j8h0";

interface Params {
  message: string;
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
    let client = new WebSocket("wss://eventsub.wss.twitch.tv/ws");
    client.onopen = (event) => {
      logger.info("[Firebot Raid Chat Alert] EventSub connection established!");
    };
    client.onmessage = async (event: any) => {
      let data = JSON.parse(event.data);
      if (data.metadata?.message_type == "session_welcome") {
        logger.info(
          "[Firebot Raid Chat Alert] session_welcome: " + JSON.stringify(data),
        );
        let id = data.payload.session.id;
        keepaliveTimeoutSeconds.interval =
          data.payload.session.keepalive_timeout_seconds;
        // https://dev.twitch.tv/docs/api/reference/#create-eventsub-subscription
        await axios({
          method: "POST",
          url: "https://api.twitch.tv/helix/eventsub/subscriptions",
          headers: {
            "Client-ID": CLIENT_ID,
            Authorization: `Bearer ${runRequest.firebot.accounts.streamer.auth.access_token}`,
            "Content-Type": "application/json",
          },
          data: {
            type: "channel.raid",
            version: "1",
            condition: {
              from_broadcaster_user_id:
                runRequest.firebot.accounts.streamer.userId,
            },
            transport: {
              method: "websocket",
              session_id: id,
            },
          },
        })
          .then(async (res) => {
            if (res.status != 202) {
              logger.info(JSON.stringify(res.data)); // Actually json but logger.info only accepts strings
            }
          })
          .catch((err) => {
            if (err.response) {
              // The request was made and the server responded with a status code
              // that falls out of the range of 2xx
              logger.error(err.response.data);
              logger.error(err.response.status);
              logger.error(err.response.headers);
            } else if (err.request) {
              // The request was made but no response was received
              // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
              // http.ClientRequest in node.js
              logger.error(err.request);
            } else {
              // Something happened in setting up the request that triggered an Error
              logger.error("Error", err.message);
            }
          });
      } else if (data.metadata?.message_type == "session_keepalive") {
        logger.info(
          "[Firebot Raid Chat Alert] session_keepalive: " +
            JSON.stringify(data),
        );
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
        logger.info(`Raid-Message: ${message}`);
        await axios({
          method: "POST",
          url: "http://localhost:7472/api/v1/effects",
          data: {
            effects: {
              list: [
                {
                  chatter: "bot", // or "streamer"
                  type: "firebot:chat",
                  active: "true",
                  message,
                },
              ],
            },
          },
        })
          .then(async (res) => {
            if (res.status != 200) {
              logger.info(JSON.stringify(res.data)); // Actually json but logger.info only accepts strings
            }
          })
          .catch((err) => {
            if (err.response) {
              // The request was made and the server responded with a status code
              // that falls out of the range of 2xx
              logger.error(err.response.data);
              logger.error(err.response.status);
              logger.error(err.response.headers);
            } else if (err.request) {
              // The request was made but no response was received
              // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
              // http.ClientRequest in node.js
              logger.error(err.request);
            } else {
              // Something happened in setting up the request that triggered an Error
              logger.error("Error", err.message);
            }
          });
      } else {
        logger.info(
          "[Firebot Raid Chat Alert] EventSub Data: " + JSON.stringify(data),
        );
      }
      keepaliveTimeoutSeconds.start = Date.now() / 1000;
      keepaliveTimeoutSeconds.end =
        keepaliveTimeoutSeconds.start + keepaliveTimeoutSeconds.interval;
    };
  },
};

export default script;
