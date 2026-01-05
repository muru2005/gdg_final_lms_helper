# LMS Helper - File Processing with AI

This extension provides three main features for any file:
1. **View & Ask AI** - View file content and chat with AI about it
2. **Generate Mind Map** - Create interactive mind maps from file content
3. **Generate Summary** - Create comprehensive summaries of files
4. **Generate Quiz**- Generate an MCQ QUiz for 5 Questions based on the file content to test the student
## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your Groq API key:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. Start the backend server:
   ```bash
   python app.py
   ```
   Or use the batch file:
   ```bash
   start_backend.bat
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd pdf-test
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and go to `http://localhost:5173/files` to see the file browser

## Features

### Three-Button Interface
Each file in the browser shows three buttons on hover:

1. **👁️ View & Ask AI**
   - Opens the file viewer with content preview
   - Provides AI chat interface for questions about the file
   - Uses RAG (Retrieval Augmented Generation) for accurate responses

2. **🧠 Mind Map**
   - Generates interactive mind maps from file content
   - Creates hierarchical visualization of concepts
   - Allows expanding/collapsing nodes
   - Supports zoom and pan interactions

3. **📝 Summary**
   - Creates comprehensive summaries of file content
   - Uses structured formatting with headings and bullet points
   - Provides download as PDF functionality
   - Caches generated summaries for quick access
4. **Quiz**
   - It takes the first 15,000 characters of the document to ensure the AI has enough context without exceeding its "context window" (memory limit).
   -  It also requires an access_token (OAuth), which is necessary to act on your behalf when creating the Google Form later.
   -  The prompt explicitly tells the AI to "OUTPUT ONLY A VALID JSON ARRAY". This is critical because code cannot easily read a conversational response like "Sure! Here are some questions..

### Smart Processing
- **First-time generation**: Shows confirmation dialog before processing
- **Cached results**: Instantly shows previously generated content
- **File type support**: PDF, TXT, MD, and code files
- **Share functionality**: Integration ready for Google Drive sharing

### AI Chat Features
- Context-aware responses based on file content
- Markdown formatting support
- Real-time conversation interface
- File-specific knowledge base

## File Structure
```
gdg_final_lms_helper/
├── backend/
│   ├── app.py                # Flask backend
│   ├── requirements.txt      # Python dependencies
│   ├── .env                  # API keys
│   └── start_backend.bat     # Windows startup script
│
└── pdf-test/
    ├── src/
    │   ├── components/
    │   │   ├── FileViewer.jsx     # File viewer with action buttons
    │   │   ├── ChatBox.jsx        # AI chat component
    │   │   ├── MindMap.jsx        # Interactive mind map
    │   │   ├── SummaryModal.jsx  # Summary modal
    │   │   └── QuizModal.jsx     # Quiz UI
    │   │
    │   ├── utils/
    │   │   ├── markdownParser.jsx
    │   │   └── analytics.js
    │   │
    │   ├── AIViewer.jsx          # Main AI viewer (Share enabled)
    │   ├── App.jsx               # App routing & layout
    │   ├── Courses.jsx
    │   ├── Dashboard.jsx
    │   ├── Datasync.jsx
    │   ├── Home.jsx
    │   ├── MainLayout.jsx
    │   ├── background.jsx
    │   ├── content.jsx
    │   ├── index.css
    │   └── main.jsx
    │
    ├── public/
    │   └── index.html
    │
    ├── manifest.json             # Chrome extension manifest
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    ├── eslint.config.js
    └── .gitignore
```

## API Endpoints

- `POST /process-file` - Process file for AI operations
- `POST /generate-summary` - Generate or retrieve file summary
- `POST /generate-mindmap` -  Generate or retireve mindmap for contents
- `POST/generate-quiz`- Generate an MCQ Quiz based on the document provided
- `POST /chat` - Chat with AI about file content
- `GET /file-status/{file_path}` - Check processing status
- ` POST /track-event` - to store the pressed button in google analytics
- `POST /api/save-summary`- Helps in saving summary in the gooogle docs format 
- `POST /api/upload-file-to-drive`- Helps in uploading the mindmap to the google drive
- `POST /api/verify-drive-token`- Verifies the google drive token
-  `POST /api/sync-assignments/`- Sync the assingments to the firestore
-  `POST /api/get-assignments` - get assignments from the firestore of a particular user
-  ` POST /api/mark-submitted` - To ensure the assignment once clicked submmited in the mail no longer the remainder for it is sent through the mail
-   `POST /unssubscribe`   - To handle sunsubscribe requests for teh cron reminder email
-   
 ## Usage

1. Start both backend and frontend servers
2. Navigate to `/files` in your browser
3. Hover over any file to see the three action buttons
4. Click any button to:
   - View the file and ask AI questions and attend quiz
   - Generate an interactive mind map
   - Create a comprehensive summary

The system will ask for confirmation before generating new content and will cache results for faster subsequent access.
Regenerate option is there as well regenerate the summary or the mindmap

## Share Feature

The share button (🔗) appears in viewers and allows sharing:
- PDF files
- Generated summaries
- Mind map visualizations

