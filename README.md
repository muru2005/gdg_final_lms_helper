# LMS Helper - One Side Panel. Everything.

## The Problem with Traditional LMS Content

### Scattered Information
• Students constantly switch between LMS, Gmail, Calendar, and Drive.
• No easy access, download or sharing of learning materials.

### Missed Deadlines
• Assignment information is scattered along platforms.
• Lack of timely notifications leads to missed submissions and last-minute stress.

### No Contextual Help
• Students receive constant, in-context help while viewing slides.
• Learning becomes passive and less engaging.

## Solution - LMS Helper – One Side Panel. Everything.

• LMS Helper is a Chrome extension side panel integrated directly with the LMS (Learning Management System).
• Provides centralised access to:
  1. courses,
  2. deadlines,
  3. notes, and
  4. AI help.

• Works alongside the current LMS without replacing it.
• Makes it easier for the students to access the course content, share the pdfs and download the materials.
• Leveraging AI Tools side-by-side, improves the productivity and performance of the students while learning and preparing for exams.

## Features

This extension provides comprehensive features for enhanced learning:

### Core AI Features
1. **View & Ask AI** - View file content and chat with AI about it
2. **Generate Mind Map** - Create interactive mind maps from file content
3. **Generate Summary** - Create comprehensive summaries of files
4. **Generate Quiz** - Generate an MCQ Quiz for 5 Questions based on the file content to test the student

### Smart Automation
5. **Cron Email Automation** - Send pending assignments on Gmail as notifications (customizable)
6. **Google Calendar Integration** - Updated academic working days, holidays as per student's semester
7. **Share Course Materials** - Share mindmaps and other content with Google Drive API
8. **Download Manager** - Download course materials unit wise or all together

### Demo
🎥 **Demo Video**: [https://ssn.lat/LMSHelper](https://ssn.lat/LMSHelper)
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

3. Create a `.env` file with required environment variables:
   ```
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GROQ_API_KEY=your_groq_api_key_here
   SMTP_SERVER="smtp.gmail.com"
   SMTP_PORT=587
   SMTP_EMAIL=your_email@gmail.com
   SMTP_PASSWORD="your_app_password"
   GA_MEASUREMENT_ID=your_ga_measurement_id
   GA_API_SECRET=your_ga_api_secret
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

3. Build the extension:
   ```bash
   npm run build
   ```

### Chrome Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`

2. Enable "Developer mode" (toggle in top-right corner)

3. Click "Load unpacked" and select the `pdf-test` folder

4. The extension will appear in your extensions list

### Development Workflow

For any code changes:
1. Make your changes to the source files
2. Run `npm run build` in the `pdf-test` directory
3. Go to `chrome://extensions/` and click the refresh button on your extension
4. Changes will now be reflected in the extension

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

## AI Processing Architecture

### RAG Chat System
- **Text Processing**: PDF content split into 800-word chunks with 150-word overlap
- **Vector Storage**: ChromaDB with all-MiniLM-L6-v2 embeddings for semantic search
- **Query Processing**: Retrieves top 3 relevant chunks for context
- **AI Model**: Groq Llama-3.1-8b-instant (temperature=0)

### Summary Generation
- **Content Limit**: First 12,000 characters for model context
- **AI Model**: Groq Llama-3.1-8b-instant (temperature=0.3)
- **Output Format**: Structured markdown with bold headings and bullet points
- **Caching**: Firestore storage with file hash as identifier

### Mind Map Creation
- **Content Source**: Uses existing summary or first 10,000 characters
- **AI Model**: Groq Llama-3.1-8b-instant (temperature=0.1)
- **Output Format**: Hierarchical JSON structure `{title: "...", children: [{title: "...", children: [...]}]}`
- **Processing**: Regex-based JSON extraction from AI response

## File Structure
```
gdg_final_lms_helper/
├── backend/
│   ├── .chromadb/              # ChromaDB vector database storage
│   ├── app.py                  # Main Flask backend server
│   ├── cron_job.py             # Email automation scheduler
│   ├── drive.py                # Google Drive API integration
│   ├── test_backend.py         # Backend testing utilities
│   ├── debug_dashboard.html    # Debug interface
│   ├── debug_login_page.html   # Debug login page
│   ├── requirements.txt        # Python dependencies
│   └── .env                    # API keys and environment variables
│
└── pdf-test/
    ├── src/
    │   ├── components/
    │   │   ├── FileBrowser.jsx     # File browser interface
    │   │   ├── FileViewer.jsx      # File viewer with action buttons
    │   │   ├── ChatBox.jsx         # AI chat component
    │   │   ├── MindMap.jsx         # Interactive mind map
    │   │   ├── SummaryModal.jsx    # Summary modal
    │   │   └── QuizModal.jsx       # Quiz UI
    │   │
    │   ├── utils/
    │   │   ├── markdownParser.jsx  # Markdown processing
    │   │   └── analytics.js        # Google Analytics integration
    │   │
    │   ├── assets/
    │   │   └── react.svg           # React logo
    │   │
    │   ├── AIViewer.jsx            # Main AI viewer (Share enabled)
    │   ├── App.jsx                 # App routing & layout
    │   ├── Courses.jsx             # Course management
    │   ├── Dashboard.jsx           # Main dashboard
    │   ├── DataSync.jsx            # Data synchronization
    │   ├── Home.jsx                # Home page
    │   ├── MainLayout.jsx          # Layout component
    │   ├── background.jsx          # Chrome extension background script
    │   ├── content.jsx             # Chrome extension content script
    │   ├── index.css               # Global styles
    │   └── main.jsx                # React entry point
    │
    ├── public/
    │   ├── pdf.worker.mjs          # PDF.js worker
    │   └── vite.svg                # Vite logo
    │
    ├── manifest.json               # Chrome extension manifest
    ├── index.html                  # Main HTML file
    ├── package.json                # Node.js dependencies
    ├── package-lock.json           # Dependency lock file
    ├── vite.config.js              # Vite configuration
    ├── eslint.config.js            # ESLint configuration
    ├── .gitignore                  # Git ignore rules
    └── README.md                   # Project documentation
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
-   `POST /unsubscribe`   - To handle unsubscribe requests for teh cron reminder email
-   `POST/sync-calendar` -TO sync the assignments with the google calendar
-     `POST/trigger-reminders`-send the assignment reminders to the sutdent's email
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

## Google Technologies Used

**Google OAuth** – Used to provide secure login using Google accounts and restrict access to SSN students only.

**Google Calendar** – Integrated to sync academic schedules, exams, deadlines, working days, and holidays directly into the student's calendar.

**Gmail** – Used to automatically send reminder emails to SSN accounts about pending, due, and overdue assignments.

**Google Docs** – Used to store AI-generated summaries as editable documents and to generate summary PDFs that students can modify.

**Google Drive** – Enables one-click sharing of summaries, mind maps, and PDFs with classmates or teachers.

**Google Chrome Extension** – The primary user interface that integrates directly with LMS and Google Drive for instant AI-powered file processing.

**Google Cloud Console** – Used to manage all clients, credentials, APIs, and enabled Google services for the platform.

**Google Forms** – Used to auto-generate self-evaluation quizzes from study material and summaries.

**Google Analytics** – Used to track user behavior and usage patterns to continuously improve the platform.

**Firestore (Firebase)** – Used to store all summaries, documents, metadata, and user activity for fast access and easy sharing.

## Contributors

- **Prawin Kumar S**
- **Murari Sreekumar**
- **Srikumar V**
- **Ramcharan S**

