// Two demo modules built from material Coding in Color shared during the
// hackathon, so the demo shows CIC-shaped content rather than toy lessons:
//
//  1. "Build a Story Generator": a proposed (not yet approved) 5-lesson Python + AI module
//     that expands Greg Vannoni's "Mini Name in a Book" guest lesson. It keeps the draft's
//     choices: the same 8 questions open and close the module, every lesson ends
//     with a worksheet or exit ticket, and AI is a "prompt, run, explain, fix" workflow
//     with no student AI accounts and no personal data in prompts.
//  2. "Data & AI: how machines learn": CIC's Module 3 slides (AI vs ML vs deep
//     learning, the data pipeline, the class snack survey, bias).
//
// Code exercises set variables instead of calling input(), so the checker can run
// them. In class, students can swap the first line for input() once it passes.
// Video links are left for CIC to add in the editor: we don't guess URLs.

const q = (concept, question, choices, answer) => ({ concept, question, choices, answer });

// The same test opens and closes the Story Generator module, as in the draft.
const storyTest = [
  q('variables', 'What does this line do?  name = input("What is your name? ")', ['Prints your name', 'Asks a question and saves the answer', 'Picks a random name', 'Ends the program'], 1),
  q('printing-and-output', 'In print(f"Hello, {name}"), what does {name} do?', ['Prints the word name', 'Inserts the value stored in name', 'Asks a new question', 'Starts a list'], 1),
  q('variables', 'A variable is:', ['A named place that holds a value', 'A kind of error', 'A printed story', 'A website'], 0),
  q('ai-basics', 'A program asks for a theme, then uses if/elif to print a different story for space, ocean or desert. That program is:', ['An AI model', 'A set of rules: input in, rules run, output out', 'A random guess', 'A worksheet'], 1),
  q('lists', 'What does random.choice(["red", "blue"]) return?', ['Both words, every time', 'One of the items, picked at random', 'An error', 'The first item, always'], 1),
  q('functions', 'What is a function in Python?', ['A named block of code you can run again by calling its name', 'A type of variable', 'A comment', 'A story theme'], 0),
  q('ai-basics', 'An AI model writes a story from your name, hometown and hobby. Where did the words come from?', ['Rules a programmer typed for exactly your inputs', 'Patterns the model learned from large amounts of text', 'A list you wrote', 'The random module'], 1),
  q('ai-basics', 'An AI tool gives you code. What is the best next step?', ['Turn it in as yours', 'Run it, read any error, and be able to explain what it does', 'Delete it', 'Share it with your name and address in a comment'], 1),
];

export const extraConcepts = [{ key: 'data-and-bias', name: 'Data and bias' }];

export const cicModules = [
  {
    title: 'Build a Story Generator',
    summary: 'Your name in a story, written by code you wrote, then improved with rules, randomness and AI you learned to check. Five lessons and a capstone for a real reader.',
    lessons: [
      {
        title: '1. Your name in a story',
        activities: [
          { type: 'pretest', title: 'Pretest: what do you already know?', content: {
            body: "This is not graded. Answer what you can and guess if you need to. You'll take the same test at the end, and the difference shows how much you learned.",
            questions: storyTest } },
          { type: 'reading', title: 'Three ideas: variables, input() and f-strings', concept: 'variables', content: {
            body: 'A variable is a named box that holds a value. In name = "Ada", name is the box and "Ada" is what is inside.\n\ninput("What is your name? ") asks a question and gives back the answer, so name = input(...) stores whatever the user types.\n\nAn f-string has an f before the quote. Inside it, {name} is replaced by what is in the box: print(f"Hi, {name}!") shows Hi, Ada!\n\nWhen something breaks, read the LAST line of the error first: it says what broke. The line number says where to look.' } },
          { type: 'code', title: 'Level 1: put your name in the story', concept: 'printing-and-output', content: {
            prompt: 'The story should open with the hero\'s name. Set name to "Ada", then print exactly:\nOnce upon a time, Ada discovered a mysterious door',
            starter: '# In class you can use: name = input("What is your name? ")\nname = "Ada"\n\nprint("Once upon a time, {name} discovered a mysterious door")\n',
            expected_output: 'Once upon a time, Ada discovered a mysterious door',
            hints: ['Run it. Does the story show Ada, or the word {name} in curly braces?', 'For Python to swap {name} for the value, the string needs one extra character in front of the opening quote. Which one?'] } },
          { type: 'check', title: 'Spot the bug', concept: 'printing-and-output', content: {
            question: 'print("Everyone knew Sam was the best at {hobby}.") prints {hobby} instead of the answer. What is missing?',
            choices: ['A second print()', 'An f right before the opening quote', 'Quotes around hobby', 'A colon at the end'], answer: 1,
            explanation: 'Without the f, Python treats {hobby} as ordinary text. f"...{hobby}..." swaps in the value.' } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'In one sentence, what did your program do? What is one thing you changed, and what happened?' } },
        ],
      },
      {
        title: '2. Make it yours',
        activities: [
          { type: 'worksheet', title: 'Plan on paper first', concept: 'variables', content: {
            body: 'Programmers decide their variables before they type. Use a first name or a made-up hero name only, never a full name, school or address.',
            fields: [
              { label: 'Hometown', kind: 'text' },
              { label: 'Hobby', kind: 'text' },
              { label: 'Sidekick (first name or nickname only)', kind: 'text' },
              { label: 'My own variable: its name, and the question it asks', kind: 'text' },
              { label: 'The f-string print line that uses it', kind: 'long' },
            ] } },
          { type: 'code', title: 'Level 2: four variables make a generator', concept: 'variables', content: {
            prompt: 'Use the variables to print exactly these two lines:\nEveryone in Phoenix knew Ada was the best at robotics.\nBut no one, not even Leo, knew what was behind that door...',
            starter: 'name = "Ada"\nhometown = "Phoenix"\nhobby = "robotics"\nsidekick = "Leo"\n\n# Print the two lines using f-strings\n',
            expected_output: 'Everyone in Phoenix knew Ada was the best at robotics.\nBut no one, not even Leo, knew what was behind that door...',
            tests: 'assert (name, hometown, hobby, sidekick) == ("Ada", "Phoenix", "robotics", "Leo"), "keep the four variables as given and use them in the f-strings"',
            hints: ['Each line is one print(f"...") with {variable} where the word should change.', 'Check the punctuation: the first line ends with a full stop, the second with three dots.'] } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'Write your new variable\'s name, the question it asks, and the print line that uses it.' } },
        ],
      },
      {
        title: '3. Choose the adventure',
        activities: [
          { type: 'reading', title: 'Rules-based models: if, elif, else', concept: 'conditionals', content: {
            body: 'A theme picker lets the user\'s choice decide which code runs. Input goes in, rules a programmer wrote run, output comes out. That is a rules-based model: the same input always gives the same output.\n\nif checks one choice, elif checks the next, and else catches everything else, including typos.\n\n.lower() turns Space, SPACE and space into the same choice. Without it, capital letters become a bug your users will find in 10 seconds.' } },
          { type: 'code', title: 'Level 3: the theme picker', concept: 'conditionals', content: {
            prompt: 'Finish story_start(name, theme). It returns:\n- "space":  NAME floated into the stars.\n- "ocean":  NAME dove into a coral city.\n- "desert": NAME stepped onto warm Arizona sand.\n- anything else: NAME found the library again.\nCapital letters must not matter.',
            starter: 'def story_start(name, theme):\n    theme = theme  # make capital letters not matter\n    if theme == "space":\n        return f"{name} floated into the stars."\n    # add elif for ocean and desert, then else\n\nprint(story_start("Ada", "Ocean"))\n',
            tests: 'assert story_start("Ada", "space") == "Ada floated into the stars.", "space"\nassert story_start("Ada", "Ocean") == "Ada dove into a coral city.", "Ocean with a capital O should still work"\nassert story_start("Ki", "DESERT") == "Ki stepped onto warm Arizona sand.", "DESERT in capitals"\nassert story_start("Ada", "volcano") == "Ada found the library again.", "a theme that does not exist goes to else"',
            hints: ['Which string method turns "Ocean" into "ocean"?', 'Every path needs to return something. What should happen when no theme matches?'] } },
          { type: 'check', title: 'Predict before you run', concept: 'conditionals', content: {
            question: 'Before anyone adds a volcano theme, the user types volcano. Which block runs?',
            choices: ['The if block', 'The first elif', 'The else block', 'None: it crashes'], answer: 2,
            explanation: 'else is not an error case. It is the program being polite about a choice it was not built for.' } },
        ],
      },
      {
        title: '4. Surprise me',
        activities: [
          { type: 'reading', title: 'Lists, random.choice() and functions', concept: 'lists', content: {
            body: 'A list holds many values in one variable: twists = ["a", "b", "c"].\n\nrandom.choice(twists) picks one item at random every time it runs. Same code, different story.\n\nA function is a named block of code. def make_story(): writes it, and nothing runs yet. make_story() runs it.\n\nMoving code inside a function is where indentation errors appear. Move a few lines at a time and run after each move.' } },
          { type: 'code', title: 'Level 4: a different twist every run', concept: 'lists', content: {
            prompt: 'Add at least two twists of your own so the list has 6 or more. Then finish make_twist() so it returns a random twist.',
            starter: 'import random\n\ntwists = [\n    "a talking javelina appeared with a treasure map",\n    "the ground turned into a giant trampoline",\n    "every book in the library began to sing",\n    "a tiny robot offered a glowing key",\n]\n\ndef make_twist():\n    # return one twist, picked at random\n    pass\n\nprint(f"Suddenly, {make_twist()}!")\n',
            tests: 'assert len(twists) >= 6, "add at least two twists of your own"\nseen = {make_twist() for _ in range(200)}\nassert seen <= set(twists), "make_twist() must return an item from twists"\nassert len(seen) > 1, "make_twist() should not return the same twist every time"',
            hints: ['Which function from the random module picks one item from a list?', 'A function hands back a value with return. Is your function returning the twist, or just printing it?'] } },
          { type: 'check', title: 'Three runs', concept: 'lists', content: {
            question: 'You run the generator three times. Could all three print the same twist?',
            choices: ['No, random never repeats', 'Yes, each run picks on its own with no memory', 'Only if the list is sorted'], answer: 1,
            explanation: 'random.choice has no memory. Each run picks independently, so repeats can happen.' } },
        ],
      },
      {
        title: '5. Code with AI, check the AI',
        activities: [
          { type: 'reading', title: 'Prompt, run, explain, fix', concept: 'ai-basics', content: {
            body: 'AI is not a button in this lesson. It is a workflow: Prompt, paste, run, read the error, explain or fix, and only then keep it.\n\nA prompt that works names four things:\n1. The job: "Write Python code that adds a forest theme to a story generator."\n2. The context: "The program already has variables called name, hometown, hobby and sidekick."\n3. The limits: "Use only if/elif and print. No new imports. Under 8 lines."\n4. The check: "Explain each line in one short comment."\n\nThe rule: AI can draft. You decide. You are responsible for what you turn in. No personal data in any prompt: first name or a made-up hero name only.' } },
          { type: 'worksheet', title: 'Prompt Lab', concept: 'ai-basics', content: {
            fields: [
              { label: 'The improvement we chose', kind: 'text' },
              { label: 'Our prompt: the job, the context, the limits and the check', kind: 'long' },
              { label: 'Did it run the first time? If not, what did the error say?', kind: 'long' },
              { label: 'The hardest line in the AI code, explained in our own words', kind: 'long' },
              { label: 'The fix we made before keeping it', kind: 'long' },
              { label: 'Whose data is in our story, and did they agree to it?', kind: 'long' },
            ] } },
          { type: 'check', title: 'Rules or AI?', concept: 'ai-basics', content: {
            question: 'Which is true about the rules version of your generator compared with an AI version?',
            choices: ['The rules version can surprise you with new words', 'The rules version does exactly what its programmer wrote, every time', 'The AI version is always correct'], answer: 1,
            explanation: 'Rules are predictable. AI output is different every time, and it can be wrong, generic or not what you asked for.' } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'What did the AI get wrong or surprise you with, and what did you do about it?' } },
        ],
      },
      {
        title: 'Capstone: a story generator for a real reader',
        activities: [
          { type: 'worksheet', title: 'Capstone planning sheet', content: {
            body: 'Build a complete story generator for one real reader: a younger sibling, a cousin, a teacher or a grandparent. Must have: 4+ inputs, a picker with 3+ choices and an else, a list with random.choice(), the story inside a function, comments, and no personal data beyond a first name.',
            fields: [
              { label: 'My reader is, and they love', kind: 'text' },
              { label: 'My 4+ inputs (variable name and question)', kind: 'long' },
              { label: 'My 3+ themes', kind: 'text' },
              { label: 'My random list holds', kind: 'text' },
              { label: 'A line of code I am proud of, and what it does', kind: 'long' },
              { label: 'One bug I fixed and how I found it', kind: 'long' },
            ] } },
          { type: 'posttest', title: 'Post-test: same questions, new answers', content: {
            body: 'Same 8 questions as the pretest. Answer from what you know now.',
            questions: storyTest } },
        ],
      },
    ],
  },
  {
    title: 'Data & AI: how machines learn',
    summary: 'How AI uses data, the difference between AI, machine learning and deep learning, the data pipeline, and why AI can be biased.',
    lessons: [
      {
        title: 'What is AI?',
        activities: [
          { type: 'pretest', title: 'Pretest: where are you starting?', content: {
            questions: [
              q('ai-basics', 'Deep learning is:', ['A kind of machine learning that uses many-layer neural networks', 'Another name for any computer program', 'A way to store files'], 0),
              q('ai-basics', 'A model learns from photos already labelled "cat" or "dog". That is:', ['Unsupervised learning', 'Supervised learning', 'Reinforcement learning'], 1),
              q('data-and-bias', 'Which step comes right before training a model?', ['Making predictions', 'Cleaning and organizing the data', 'Deleting the data'], 1),
              q('data-and-bias', 'A face-recognition model was trained mostly on photos of one group of people. What is the likely result?', ['It works equally well for everyone', 'It works worse for groups it saw less of', 'It refuses to run'], 1),
            ] } },
          { type: 'reading', title: 'AI, machine learning and deep learning', concept: 'ai-basics', content: {
            body: 'Artificial intelligence: teaching a machine to act, respond or think like a human. Examples: ChatGPT, Gemini, facial recognition, self-driving cars.\n\nMachine learning: a kind of AI that learns patterns from data instead of following rules a person wrote. A person still gives it data to kick off the learning.\n\nDeep learning: a kind of machine learning that uses many-layer neural networks and much larger sets of data.\n\nPicture three circles, one inside the other: AI is the biggest, machine learning sits inside it, and deep learning sits inside machine learning.' } },
          { type: 'reading', title: 'Three ways machines learn', concept: 'ai-basics', content: {
            body: 'Supervised learning: every example comes with the right answer (a label). Example: sorting cat and dog photos.\n\nUnsupervised learning: no labels. The model finds groups or patterns on its own. Example: a shopping site grouping customers by what they buy.\n\nReinforcement learning: no data at the start. The model tries things, is told when it makes a mistake, and gets a reward when it is right. Example: a program learning to play a game.' } },
          { type: 'check', title: 'Which kind of learning?', concept: 'ai-basics', content: {
            question: 'A music app groups listeners by what they play, without anyone telling it what the groups should be. Which kind of learning is that?',
            choices: ['Supervised', 'Unsupervised', 'Reinforcement'], answer: 1,
            explanation: 'There are no labels: the app finds the groups by itself.' } },
        ],
      },
      {
        title: 'The data pipeline',
        activities: [
          { type: 'reading', title: 'Collect, process, train, predict', concept: 'data-and-bias', content: {
            body: '1. Collecting data: from sensors, apps, cameras, searches and users.\n2. Processing data: raw data is messy, so it is cleaned, filtered and organized.\n3. Training: the model learns patterns from the historical data.\n4. Prediction: the trained model makes predictions or recommendations.\n\nThe purpose of the AI decides what data it collects. Self-driving cars need camera images for object detection. Netflix and Instagram collect what you like and skip for recommendations.' } },
          { type: 'code', title: 'Clean the class snack survey', concept: 'data-and-bias', content: {
            prompt: 'The class answered "What is your favorite snack?" The answers are messy: extra spaces and random capital letters. Make a list clean where every answer is stripped and lowercase, then print how many people said takis.',
            starter: 'snacks = ["Takis", " takis", "Hot Cheetos", "hot cheetos ", "TAKIS", "Pickles", "takis ", "Elote", "hot Cheetos"]\n\n# Make a cleaned copy: no extra spaces, all lowercase\nclean = []\n\nprint(clean.count("takis"))\n',
            expected_output: '4',
            tests: 'assert clean == [s.strip().lower() for s in snacks], "every answer should be stripped and lowercase, in the same order"\nassert clean.count("hot cheetos") == 3, "three people said hot cheetos once the data is clean"',
            hints: ['Before cleaning, how many different ways is "takis" written in the list? That is why the raw count is wrong.', 'Two string methods help: one removes spaces at the ends, one makes letters lowercase. You can use a loop or a list comprehension.'] } },
          { type: 'worksheet', title: 'What trends do we see in the data?', concept: 'data-and-bias', content: {
            fields: [
              { label: 'Which snack is the most popular once the data is clean?', kind: 'text' },
              { label: 'What would the raw, messy count have told us instead? Why does cleaning matter?', kind: 'long' },
              { label: 'Name one app you use. What data do you think it collects about you, and what does it predict?', kind: 'long' },
            ] } },
        ],
      },
      {
        title: 'Can AI be biased?',
        activities: [
          { type: 'reading', title: 'Bias comes in with the data', concept: 'data-and-bias', content: {
            body: 'A machine learning model only knows the data it was trained on. If that data leaves people out, or reflects unfair decisions from the past, the model learns those patterns too.\n\nExample: a face-recognition model trained mostly on lighter-skinned faces makes more mistakes on darker-skinned faces.\n\nCleaner, more representative data helps models find patterns more accurately, for everyone.' } },
          { type: 'check', title: 'Spot the bias', concept: 'data-and-bias', content: {
            question: 'A hiring model was trained on 10 years of a company\'s past hires, who were mostly men. What is the biggest risk?',
            choices: ['The model runs slowly', 'The model learns to prefer candidates who look like past hires', 'The model forgets the data'], answer: 1,
            explanation: 'The model copies patterns in its training data, including unfair ones.' } },
          { type: 'worksheet', title: 'Combat biased models', concept: 'data-and-bias', content: {
            fields: [
              { label: 'Three ways we can reduce bias in a model', kind: 'long' },
              { label: 'Who should check an AI system before it is used on real people?', kind: 'long' },
            ] } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'How would you explain to a younger student why AI can be unfair?' } },
          { type: 'posttest', title: 'Post-test: show what you learned', content: {
            questions: [
              q('ai-basics', 'Which sentence is true?', ['All AI is deep learning', 'Deep learning is a kind of machine learning, which is a kind of AI', 'Machine learning and AI are unrelated'], 1),
              q('ai-basics', 'A game-playing program gets points when it wins and loses points when it makes a mistake. That is:', ['Supervised learning', 'Unsupervised learning', 'Reinforcement learning'], 2),
              q('data-and-bias', 'Put the pipeline in order:', ['Train, collect, predict, process', 'Collect, process, train, predict', 'Predict, train, process, collect'], 1),
              q('data-and-bias', 'What is the best way to reduce bias in a model?', ['Train it on data that represents everyone it will be used on', 'Use a faster computer', 'Hide the training data'], 0),
            ] } },
        ],
      },
    ],
  },
];
