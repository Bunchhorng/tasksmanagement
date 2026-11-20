# TaskManagement

## Run the project after receiving the ZIP (Windows)

You can ZIP the whole project folder without deleting anything. After receiving it, the person should:

1. Extract the ZIP to a normal folder. Keep the `backend` and `frontend` folders together. They do not need to open or extract any ZIP files found inside it.
2. Install Python and Node.js if they are not already installed. Use Python supported by the Django version in `backend/requirements.txt` and a current Node.js LTS release.
3. Open **PowerShell** and start the backend in its own terminal:

   ```powershell
   cd "C:\path\to\extracted\taskmanagement\backend"
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe manage.py migrate
   .\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
   ```

   Keep this terminal open. The included `backend\venv` is specific to the computer that created it; use the fresh `.venv` above instead. Creating `.venv` does not require removing or changing any of the zipped files.

4. Open a **second PowerShell** window and start the frontend:

   ```powershell
   cd "C:\path\to\extracted\taskmanagement\frontend"
   npm install
   npm run dev
   ```

5. Open the local address printed by Vite, usually `http://localhost:5173`. Allow microphone access if using voice commands.

Both terminals must remain open while using the app. Stop either server with **Ctrl+C**. The project uses a local SQLite database at `backend\db.sqlite3`; if that file is included in the ZIP, it contains the tasks from the computer that made the ZIP. Keep your original ZIP as a backup before sharing it.

# VoiceTask voice command guide

## The basic formula

For most commands, say:

> **command + task name + optional date/time/priority**

Replace the words in `[square brackets]` with your own task details. Speak naturally; you do not have to say the brackets or the word “task” every time.

## Add a task

Try any of these:

- “Add a task to **[call Mom]**.”
- “Create a task **[buy groceries]** tomorrow at **[3 PM]**.”
- “Remind me to **[send the invoice]** by **[Friday]**.”
- “I need to **[finish the report]** next week.”

You can add details to the same sentence:

> **add/create/remind me to + [task] + [date] + [time] + [priority]**

Examples:

- “Add a task to call Alex tomorrow at 5 PM, high priority.”
- “Remind me to pay rent on November 30.”

If you leave details out, the assistant asks for them one at a time. Answer with:

- **Date:** today, tomorrow, the day after tomorrow, Monday, next Friday, November 15, in two days, or no deadline.
- **Time:** 3 PM, 10:30 AM, noon, midnight, morning, afternoon, evening, or any time.
- **Priority:** high, medium, or low. “Urgent” and “ASAP” mean high priority.
- **Notes:** say your note, or say no/skip.
- **Save:** say yes, save, confirm, or go ahead. Say no to change a detail.

## Mark a task as done

Say:

- “Mark **[task name]** as done.”
- “Complete **[task name]**.”
- “Finish **[task name]**.”
- “**[task name]** is done.”
- “I finished **[task name]**.”

Example: “Mark send the invoice as done.”

If more than one task matches, choose by saying its number or task name. “Mark a task as done” lists your unfinished tasks so you can choose one.

## Edit a task by voice

Say the field, the existing task name, and the new value:

- “Change the date on **[task name]** to **[Friday]**.”
- “Change the time for **[task name]** to **[3 PM]**.”
- “Change the title of **[task name]** to **[call the dentist]**.”

You can also say “Change date for **[task name]**,” then provide the new date when asked. If more than one task matches, choose its number or name. Changing a date keeps the existing time when the task already has one; changing a time keeps the existing date. Say “no deadline” to clear a task’s due date.

## Delete a task

- “Delete **[task name]**.”
- “Remove **[task name]**.”

The assistant asks for confirmation. Say yes to delete or no to keep it.

## Ask about your tasks and schedule

### Today or a date

- “What is my schedule today?”
- “What do I have tomorrow?”
- “What am I doing on Friday?”
- “Am I busy next Monday?”
- “Do I have anything this week?”
- “What is due next week?”
- “What is coming up?”
- “Show me my tasks for tomorrow.”

### Missed or overdue tasks

- “Did I miss any tasks?”
- “Have I missed a task?”
- “What is overdue?”

These questions report unfinished tasks whose due dates have passed. Tasks without a deadline are not counted as overdue.

## Conversation controls

- **Help:** “help” or “what can you do?”
- **Cancel a step:** “cancel” or “never mind.”
- **End the conversation:** “goodbye,” “bye,” “stop listening,” or press **Esc**.
- **Stop a spoken reply and start listening now:** click **Stop reply & listen now** or press **Space** while the assistant is speaking. The microphone does not listen while the assistant is speaking.
- **Switch language:** press **L** to toggle English and Khmer. You can also say “speak Khmer” or “speak English.”
- **Start/stop voice chat:** press **V** or use the Talk to me button.

## If it does not understand

1. Check that the voice panel says **Listening...**. If it says **Speaking...**, click **Stop reply & listen now** or press **Space** first.
2. Look at the text shown under the conversation: it is the speech recognition transcript. If it does not match what you said, try speaking more slowly and clearly, or use shorter wording.
3. Use a task name that appears in your task list.
4. Make sure your browser has microphone permission and supports English speech recognition.

The browser performs speech recognition, so it may occasionally transcribe a spoken word incorrectly. The assistant can only interpret the words the browser recognizes.

## A full example

1. **You:** Add a task to send the invoice tomorrow at 3 PM, high priorit...............0y.
2. **Assistant:** Asks for any missing details, then reads the task back.
3. **You:** Yes.
4. **Assistant:** Saves the task.
5. **You:** If it is speaking, press Space or click “Stop reply & listen now,” then say “Mark send the invoice as done.”
6. **Assistant:** Marks the task complete.

## Run the frontend

```sh
npm install
npm run dev
```

Run the frontend tests with `npm test` and create a production build with `npm run build`.
