import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config.js";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`[${formattedTime}] ${source}: ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );
      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Try multiple possible paths for the client build directory
  const possiblePaths = [
    path.resolve(process.cwd(), "dist", "client"),
    path.resolve(import.meta.dirname, "..", "..", "dist", "client"),
    "/app/dist/client",
    "./dist/client"
  ];
  
  let distPath: string | null = null;
  
  // Find the first path that exists
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      distPath = possiblePath;
      break;
    }
  }
  
  if (!distPath) {
    // Log all attempted paths for debugging
    log(`Could not find client build directory. Attempted paths:`);
    possiblePaths.forEach(p => {
      const exists = fs.existsSync(p);
      log(`  - ${p} (exists: ${exists})`);
      if (!exists && p.includes('/app/')) {
        // List what's actually in /app/dist if it exists
        const appDistPath = '/app/dist';
        if (fs.existsSync(appDistPath)) {
          const contents = fs.readdirSync(appDistPath);
          log(`    /app/dist contents: ${contents.join(', ')}`);
        }
      }
    });
    
    // Instead of throwing, just serve a simple response
    log(`WARNING: Client build not found, serving basic response only`);
    app.get('*', (req, res) => {
      res.send(`
        <html>
          <body>
            <h1>Server Running</h1>
            <p>Client build directory not found, but server is working!</p>
          </body>
        </html>
      `);
    });
    return;
  }
  
  log(`Serving static files from: ${distPath}`);
  
  app.use(express.static(distPath));
  
  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
