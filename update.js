module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: "git pull"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "app",
        message: [
          "npm install",
          "npx --yes playwright@1.59.1 install chromium"
        ]
      }
    }
  ]
};
