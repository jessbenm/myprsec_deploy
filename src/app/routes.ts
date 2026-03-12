import { createBrowserRouter } from "react-router";
import Root from "./Root";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import Monitoring from "./pages/Monitoring";
import History from "./pages/History";
import Servers from "./pages/Servers";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Alerts from "./pages/Alerts";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true,        Component: Dashboard  },
      { path: "pipeline",   Component: Pipeline   },
      { path: "monitoring", Component: Monitoring },
      { path: "history",    Component: History    },
      { path: "servers",    Component: Servers    },
      { path: "settings",   Component: Settings   },
      { path: "profile",    Component: Profile    },
      { path: "alerts",     Component: Alerts     },
    ],
  },
]);