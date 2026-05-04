module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: "node -e \"const fs=require('fs'); for (const p of ['node_modules','dist','.vite']) fs.rmSync(p,{recursive:true,force:true});\""
      }
    }
  ]
};
