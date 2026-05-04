export default {
  version: "7.0",
  title: "Retrosite",
  description: "Generate editable website timeline reports from Wayback Machine captures.",
  icon: "favicon.ico",
  menu: async (kernel, info) => {
    const installed = info.exists("app/node_modules");
    const running = {
      install: info.running("install.json"),
      start: info.running("start.json"),
      update: info.running("update.json"),
      reset: info.running("reset.json")
    };

    if (running.install) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing",
        href: "install.json"
      }];
    }

    if (installed) {
      if (running.start) {
        const local = info.local("start.json");
        if (local && local.url) {
          return [{
            default: true,
            icon: "fa-solid fa-rocket",
            text: "Open Retrosite",
            href: local.url
          }, {
            icon: "fa-solid fa-terminal",
            text: "Terminal",
            href: "start.json"
          }];
        }

        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Terminal",
          href: "start.json"
        }];
      }

      if (running.update) {
        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Updating",
          href: "update.json"
        }];
      }

      if (running.reset) {
        return [{
          default: true,
          icon: "fa-solid fa-terminal",
          text: "Resetting",
          href: "reset.json"
        }];
      }

      return [{
        default: true,
        icon: "fa-solid fa-power-off",
        text: "Start",
        href: "start.json"
      }, {
        icon: "fa-solid fa-plug",
        text: "Update",
        href: "update.json"
      }, {
        icon: "fa-solid fa-plug",
        text: "Install",
        href: "install.json"
      }, {
        icon: "fa-regular fa-circle-xmark",
        text: "Reset Dependencies",
        href: "reset.json"
      }];
    }

    return [{
      default: true,
      icon: "fa-solid fa-plug",
      text: "Install",
      href: "install.json"
    }];
  }
};
