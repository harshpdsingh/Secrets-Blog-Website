# Secrets-Blog-Website
The Anonymous Blogging Platform is a web application that allows users to share  their thoughts, stories, or opinions on a public forum while keeping their identity hidden.


# Project Title

## 🛠️ Steps to Run the Project Locally

### 1️⃣ Prerequisites  
Ensure you have the following installed:  
- **Node.js**: Download from [nodejs.org](https://nodejs.org/)  
- **MongoDB**: Use [MongoDB Atlas](https://www.mongodb.com/) or a local instance  
- **Git**: For cloning the repository  

### 2️⃣ Clone the Repository  
To clone the repository, run the following command in your terminal:

```bash
git clone https://github.com/your-github-repo-link.git
cd your-project-folder
```
### 3️⃣ Install Dependencies
-To install all required packages, run:

```bash
npm install express mongoose dotenv passport passport-google-oauth20 cookie-session ejs
```

### 4️⃣ Configure Environment Variables
Create a .env file in the project root and add the following:

```bash
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SESSION_SECRET=your_secret_key
(Replace your_mongodb_atlas_connection_string, your_google_client_id, and your_google_client_secret with your actual credentials.)
```

### 5️⃣ Start the Server
Run the following command to start the backend server:

bash
Run
Copy code
npm start
or

bash
Run
Copy code
node server.js
6️⃣ Open the Application
Once the server is running, open your browser and go to:
🔗 http://localhost:5000

