import { useEffect } from "react";
import { polymarketClobSocket } from "../feed/polymarket-clob-ws";
import { polymarketRtdsSocket } from "../feed/polymarket-rtds-ws";
import { useSimStore } from "./sim-store";

export function useSimEngine() {
  useEffect(() => {
    const store = useSimStore.getState();
    store.init();
    polymarketClobSocket.start();
    polymarketRtdsSocket.start();
    const tickId = window.setInterval(() => {
      const current = useSimStore.getState();
      current.tick();
      polymarketClobSocket.syncSubscriptions();
    }, 1_000);
    const discoveryId = window.setInterval(() => {
      void useSimStore.getState().refreshMarkets();
    }, 30_000);
    return () => {
      window.clearInterval(tickId);
      window.clearInterval(discoveryId);
      polymarketClobSocket.stop();
      polymarketRtdsSocket.stop();
    };
  }, []);
}
