const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3007;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Function to get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Function to generate self-signed certificates for development
function generateSelfSignedCert() {
  const certDir = path.join(__dirname, 'certs');
  
  // Create certs directory if it doesn't exist
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }
  
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  const configPath = path.join(certDir, 'cert.conf');
  
  // Check if certificates already exist
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  
  try {
    console.log('Generating self-signed certificate for HTTPS...');
    
    // Get local IP address
    const localIP = getLocalIPAddress();
    console.log(`Detected local IP: ${localIP}`);
    
    // Generate private key
    execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'inherit' });
    
    // Create OpenSSL config file with Subject Alternative Name (SAN)
    const configContent = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Organization
CN = localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ${localIP}`;
    
    fs.writeFileSync(configPath, configContent);
    
    // Generate certificate with SAN
    execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 365 -config "${configPath}" -extensions v3_req`, { stdio: 'inherit' });
    
    // Clean up config file
    fs.unlinkSync(configPath);
    
    console.log('Self-signed certificate generated successfully!');
    console.log(`Certificate includes: localhost, 127.0.0.1, and ${localIP}`);
    return { keyPath, certPath };
  } catch (error) {
    console.error('Error generating self-signed certificate:', error.message);
    console.log('Make sure OpenSSL is installed on your system.');
    return null;
  }
}

// In-memory storage for uploaded SCORM packages
const scormPackages = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for in-memory file uploads
const upload = multer({ 
  storage: multer.memoryStorage(), // Store files in memory instead of disk
  fileFilter: (req, file, cb) => {
    // Accept zip files and other common SCORM file extensions
    const allowedExtensions = ['.zip', '.scorm', '.pif'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP and SCORM files are allowed'), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Function to extract and analyze SCORM package
function analyzeSCORMPackage(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    
    const scormData = {
      files: [],
      manifest: null,
      imsmanifest: null,
      structure: {}
    };

    entries.forEach(entry => {
      const fileName = entry.entryName;
      scormData.files.push({
        name: fileName,
        size: entry.header.size,
        isDirectory: entry.isDirectory
      });

      // Look for SCORM manifest file
      if (fileName.toLowerCase() === 'imsmanifest.xml') {
        try {
          const manifestContent = entry.getData().toString('utf8');
          scormData.imsmanifest = manifestContent;
          scormData.manifest = parseManifest(manifestContent);
        } catch (error) {
          console.error('Error reading manifest:', error);
        }
      }
    });

    return scormData;
  } catch (error) {
    throw new Error(`Error analyzing SCORM package: ${error.message}`);
  }
}

// Function to parse SCORM manifest
function parseManifest(xmlContent) {
  try {
    // Simple XML parsing for manifest structure
    const manifest = {
      identifier: extractXmlValue(xmlContent, 'identifier'),
      title: extractXmlValue(xmlContent, 'title'),
      organizations: [],
      resources: []
    };

    // Extract organizations
    const orgMatches = xmlContent.match(/<organizations[^>]*>(.*?)<\/organizations>/gs);
    if (orgMatches) {
      orgMatches.forEach(orgMatch => {
        const orgIdentifier = extractXmlValue(orgMatch, 'organization', 'identifier');
        const orgTitle = extractXmlValue(orgMatch, 'organization', 'title');
        manifest.organizations.push({
          identifier: orgIdentifier,
          title: orgTitle
        });
      });
    }

    // Extract resources
    const resourceMatches = xmlContent.match(/<resource[^>]*>(.*?)<\/resource>/gs);
    if (resourceMatches) {
      resourceMatches.forEach(resourceMatch => {
        const resourceId = extractXmlValue(resourceMatch, 'resource', 'identifier');
        const resourceHref = extractXmlValue(resourceMatch, 'resource', 'href');
        manifest.resources.push({
          identifier: resourceId,
          href: resourceHref
        });
      });
    }

    return manifest;
  } catch (error) {
    console.error('Error parsing manifest:', error);
    return null;
  }
}

// Helper function to extract XML values
function extractXmlValue(xml, tag, attribute = null) {
  const regex = new RegExp(`<${tag}[^>]*${attribute ? attribute + '="([^"]*)"' : '>([^<]*)<'}`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve SCORM API for content
app.get('/scorm-api.js', (req, res) => {
  const scormAPI = `
// Basic SCORM API Implementation
var API = {
  // SCORM API Version
  version: "1.2",
  
  // Initialize the connection to the LMS
  LMSInitialize: function(param) {
    console.log('SCORM API: LMSInitialize called with:', param);
    return "true";
  },
  
  // Terminate the connection to the LMS
  LMSFinish: function(param) {
    console.log('SCORM API: LMSFinish called with:', param);
    return "true";
  },
  
  // Get a data value from the LMS
  LMSGetValue: function(element) {
    console.log('SCORM API: LMSGetValue called for:', element);
    
    // Return default values for common SCORM elements
    switch(element) {
      case "cmi.core.student_name":
        return "SCORM Reader User";
      case "cmi.core.student_id":
        return "scorm-reader-user";
      case "cmi.core.lesson_location":
        return "";
      case "cmi.core.credit":
        return "credit";
      case "cmi.core.lesson_status":
        return "not attempted";
      case "cmi.core.score.raw":
        return "";
      case "cmi.core.score.max":
        return "";
      case "cmi.core.score.min":
        return "";
      case "cmi.core.total_time":
        return "PT0S";
      case "cmi.core.entry":
        return "";
      case "cmi.core.exit":
        return "";
      case "cmi.suspend_data":
        return "";
      case "cmi.launch_data":
        return "";
      case "cmi.comments":
        return "";
      case "cmi.student_data.mastery_score":
        return "";
      case "cmi.student_data.max_time_allowed":
        return "";
      case "cmi.student_data.time_limit_action":
        return "";
      case "cmi.core.session_time":
        return "PT0S";
      default:
        return "";
    }
  },
  
  // Set a data value in the LMS
  LMSSetValue: function(element, value) {
    console.log('SCORM API: LMSSetValue called for:', element, 'with value:', value);
    
    // Store the value (in a real LMS, this would be saved to the database)
    if (!API.data) {
      API.data = {};
    }
    API.data[element] = value;
    
    return "true";
  },
  
  // Commit data to the LMS
  LMSCommit: function(param) {
    console.log('SCORM API: LMSCommit called with:', param);
    return "true";
  },
  
  // Get the last error that occurred
  LMSGetLastError: function() {
    console.log('SCORM API: LMSGetLastError called');
    return "0"; // No error
  },
  
  // Get the error string for a given error code
  LMSGetErrorString: function(errorCode) {
    console.log('SCORM API: LMSGetErrorString called for:', errorCode);
    return "No Error";
  },
  
  // Get diagnostic information about the last error
  LMSGetDiagnostic: function(errorCode) {
    console.log('SCORM API: LMSGetDiagnostic called for:', errorCode);
    return "No Error";
  }
};

// Make the API available globally
if (typeof window !== 'undefined') {
  window.API = API;
  window.parent.API = API;
  window.top.API = API;
}

// Also make it available as a CommonJS module if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
`;

  res.set('Content-Type', 'application/javascript');
  res.send(scormAPI);
});

// Upload endpoint
app.post('/upload', upload.single('scormFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File uploaded:', req.file.originalname);
    
    // Generate a unique ID for this package
    const packageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    // Analyze the SCORM package from buffer
    const scormData = analyzeSCORMPackage(req.file.buffer);
    
    // Store the package in memory
    scormPackages.set(packageId, {
      filename: req.file.originalname,
      buffer: req.file.buffer,
      scormData: scormData,
      uploadedAt: new Date()
    });
    
    res.json({
      success: true,
      filename: req.file.originalname,
      packageId: packageId, // Use package ID instead of filename
      scormData: scormData,
      message: 'SCORM file uploaded and analyzed successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Error processing SCORM file',
      details: error.message 
    });
  }
});

// Serve extracted SCORM content
app.get('/content/:packageId/*', (req, res) => {
  try {
    const packageId = req.params.packageId;
    const filePath = req.params[0]; // The rest of the path
    
    // Get the package from memory
    const packageData = scormPackages.get(packageId);
    
    if (!packageData) {
      return res.status(404).json({ error: 'SCORM package not found' });
    }

    const zip = new AdmZip(packageData.buffer);
    const entry = zip.getEntry(filePath);
    
    if (!entry) {
      return res.status(404).json({ error: 'File not found in SCORM package' });
    }

    // Set appropriate content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.set('Content-Type', contentType);
    
    let content = entry.getData();
    
    // If it's an HTML file, inject the SCORM API script
    if (ext === '.html' || ext === '.htm') {
      let htmlContent = content.toString('utf8');
      
      // Inject SCORM API script before closing </head> tag or at the beginning of <body>
      const scormScript = '<script src="/scorm-api.js"></script>';
      
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `  ${scormScript}\n</head>`);
      } else if (htmlContent.includes('<body')) {
        htmlContent = htmlContent.replace('<body', `${scormScript}\n<body`);
      } else {
        // If no head or body tag, add at the beginning
        htmlContent = `${scormScript}\n${htmlContent}`;
      }
      
      content = Buffer.from(htmlContent, 'utf8');
    }
    
    res.send(content);

  } catch (error) {
    console.error('Content serving error:', error);
    res.status(500).json({ error: 'Error serving content' });
  }
});

// Get list of uploaded packages
app.get('/files', (req, res) => {
  try {
    const files = Array.from(scormPackages.entries()).map(([packageId, data]) => ({
      packageId: packageId,
      name: data.filename,
      uploadDate: data.uploadedAt
    }));

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Error reading files' });
  }
});

// Cleanup old packages (run every hour)
setInterval(() => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  for (const [packageId, data] of scormPackages.entries()) {
    if (data.uploadedAt < oneHourAgo) {
      scormPackages.delete(packageId);
      console.log('Cleaned up old package:', packageId);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
  }
  
  res.status(500).json({ error: error.message });
});

// Get local IP for display
const localIP = getLocalIPAddress();

// Start HTTP server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SCORM Reader server running on:`);
  console.log(`  HTTP:  http://localhost:${PORT}`);
  console.log(`  HTTP:  http://${localIP}:${PORT}`);
});

// Start HTTPS server
const certs = generateSelfSignedCert();
if (certs) {
  try {
    const options = {
      key: fs.readFileSync(certs.keyPath),
      cert: fs.readFileSync(certs.certPath)
    };
    
    https.createServer(options, app).listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`SCORM Reader HTTPS server running on:`);
      console.log(`  HTTPS: https://localhost:${HTTPS_PORT}`);
      console.log(`  HTTPS: https://${localIP}:${HTTPS_PORT}`);
      console.log('');
      console.log('Note: You may see a security warning in your browser due to the self-signed certificate.');
      console.log('This is normal for development. Click "Advanced" and "Proceed to localhost" to continue.');
    });
  } catch (error) {
    console.error('Error starting HTTPS server:', error.message);
    console.log('HTTPS server not started. Only HTTP server is available.');
  }
} else {
  console.log('HTTPS server not started. Only HTTP server is available.');
}
