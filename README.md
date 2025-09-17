# SCORM Reader

A Node.js application that allows you to upload, analyze, and view SCORM e-learning packages through a modern web interface.

## Features

- 📁 **File Upload**: Drag & drop or click to upload SCORM packages (.zip, .scorm, .pif)
- 📋 **Package Analysis**: Automatically extracts and analyzes SCORM manifest files
- 🌐 **Content Viewer**: View SCORM content directly in the browser
- 📊 **File Explorer**: Browse the internal structure of SCORM packages
- 🎨 **Modern UI**: Clean, responsive interface with drag & drop support

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:

   ```bash
   npm start
   ```

   Or for development with auto-restart:

   ```bash
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Upload a SCORM package by:

   - Dragging and dropping a file onto the upload area
   - Clicking the upload area and selecting a file

4. View the analyzed package information and explore the content

## Supported File Types

- `.zip` - Compressed SCORM packages
- `.scorm` - SCORM package files
- `.pif` - Package Interchange Format files

## File Size Limit

Maximum file size: 100MB

## API Endpoints

- `POST /upload` - Upload and analyze SCORM packages
- `GET /content/:filename/*` - Serve content from SCORM packages
- `GET /files` - List uploaded files
- `GET /` - Serve the main application interface

## Project Structure

```
scormreader/
├── server.js          # Main Express server
├── package.json       # Dependencies and scripts
├── public/            # Frontend files
│   ├── index.html     # Main HTML page
│   ├── styles.css     # CSS styling
│   └── script.js      # Frontend JavaScript
├── uploads/           # Uploaded SCORM files (created automatically)
└── README.md          # This file
```

## Dependencies

- **express**: Web framework
- **multer**: File upload handling
- **adm-zip**: ZIP file extraction
- **cors**: Cross-origin resource sharing
- **nodemon**: Development auto-restart (dev dependency)

## How It Works

1. **Upload**: SCORM packages are uploaded to the server using multer
2. **Extraction**: The server extracts and analyzes the ZIP contents using adm-zip
3. **Manifest Parsing**: SCORM manifest files (imsmanifest.xml) are parsed to extract metadata
4. **Content Serving**: Individual files from the package can be served directly to the browser
5. **Viewer**: The main HTML content is displayed in an iframe for interactive viewing

## SCORM Support

This application supports SCORM 1.2 and SCORM 2004 packages by:

- Extracting and parsing imsmanifest.xml files
- Identifying organizations and resources
- Serving content files with appropriate MIME types
- Providing a file tree view of package contents

## Development

To contribute or modify this application:

1. Install development dependencies: `npm install`
2. Use `npm run dev` for development with auto-restart
3. Modify the server logic in `server.js`
4. Update the frontend in the `public/` directory

## License

MIT License
