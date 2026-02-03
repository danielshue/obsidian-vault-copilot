---
name: Tutor Session
description: Start a tutoring session with practice questions or real-world examples
argument-hint: folder path (e.g., Projects/MBA/Corporate Finance)
tools:
  - list_notes_recursively
  - batch_read_notes
  - create_note
  - web_fetch
timeout: 300
---
Use the [[../Agents/Tutor.agent]] to help me learn.

**Learning Folder:** ${userInput}

**Session Mode:** ${input:mode:What would you like to do?|Practice Questions|Real-World Examples|Concept Review|Quiz Me|Free Study}

---

## Step 1: Discover Learning Content

**IMPORTANT:** 
1. Call `list_notes_recursively` with folder="${userInput}" to get ALL note paths in the learning folder and subfolders
2. Call `batch_read_notes` with the paths, setting `aiSummarize=true` and use this `summaryPrompt`:
   ```
   Extract frontmatter fields if present: Program, Course, Class, Lesson. 
   Summarize the main topic and key concepts covered in this note.
   ```

Look for these frontmatter fields in the summaries:
- **Program** - The overall program or curriculum (e.g., "MBA", "Data Science Bootcamp")
- **Course** - The specific course name (e.g., "Corporate Finance", "Machine Learning Fundamentals")
- **Class** - The class or module within the course (e.g., "Week 3: Time Value of Money")
- **Lesson** - The specific lesson or topic (e.g., "Net Present Value Calculations")

Build a mental map of the curriculum structure from the AI summaries. Use this hierarchy to:
- Understand what content has been covered
- Identify prerequisites and dependencies
- Target questions at the appropriate level
- Reference specific notes during the session

If no frontmatter is found, infer the subject from the folder name and note summaries (e.g., `Learning/Machine-Learning` → "Machine Learning").

---

## Step 2: Run Session Based on Mode

**If Practice Questions:**
Generate 3-5 practice problems based on the **actual content** found in the folder's notes. Reference specific Courses, Classes, or Lessons from the frontmatter. Start with moderate difficulty, progress to challenging. After each attempt, provide feedback and explain the optimal approach. Save worked solutions to the learning folder.

**If Real-World Examples:**
Show how the Course/Lesson topics apply in real-world scenarios. Use `web_fetch` to find current industry examples that relate to the specific content in the notes. Create a note summarizing practical applications, linked to relevant lessons.

**If Concept Review:**
Walk through concepts from the discovered notes using Socratic questioning. Follow the Program → Course → Class → Lesson hierarchy. Check understanding before advancing. Create summary notes linked to the source material.

**If Quiz Me:**
Test knowledge based on the **specific content** in the learning folder. Draw questions from the Courses, Classes, and Lessons found. Keep score by topic area and identify gaps. Suggest specific notes to review based on performance.

**If Free Study:**
Present a summary of what's in the learning folder (Programs, Courses, Classes, Lessons discovered), then ask what I'd like to focus on today.

---

**Current Context:**
- Date: ${date}
- Active Note: ${file}

${activeNoteContent}
