// Demo curriculum loaded by `npm run db:seed`. CIC replaces or edits these in
// the curriculum editor; nothing in the app depends on them.
//
// Each module follows CIC's template: pretest -> learn -> check -> practice
// (worksheet and/or Python) -> exit ticket -> post-test. Post-test questions
// test the same concepts as the pretest with different wording, so learning
// gain measures understanding rather than memory. Every question names its
// concept (by key) so gain can be reported per concept.

const q = (concept, question, choices, answer) => ({ concept, question, choices, answer });

export const modules = [
  {
    title: 'Python basics: print and variables',
    summary: 'Write a first Python program and store information in variables.',
    lessons: [
      {
        title: 'Your first program',
        activities: [
          { type: 'pretest', title: 'Pretest: where are you starting?', content: {
            body: "No pressure. This shows what you know before the module, and you'll take a similar quiz at the end.",
            questions: [
              q('printing-and-output', 'What does print("Hello") do?', ['Shows Hello on the screen', 'Saves a file named Hello', 'Sends Hello to a printer'], 0),
              q('variables', 'Which line stores 16 in a variable named age?', ['age == 16', 'age = 16', '16 = age'], 1),
              q('variables', 'city = "Phoenix" then print(city). What appears?', ['city', 'Phoenix', 'An error'], 1),
            ] } },
          { type: 'reading', title: 'Talking to the computer', concept: 'printing-and-output', content: {
            body: 'A program is a list of instructions the computer follows from top to bottom.\n\nprint("Hello, Arizona!") tells Python to show the words inside the quotes.\n\nText in Python always goes inside quotes. Numbers do not: print(2 + 3) shows 5.' } },
          { type: 'reading', title: 'Variables are labelled boxes', concept: 'variables', content: {
            body: 'A variable is a labelled box that holds one value.\n\nname = "Ana" puts the text Ana in a box labelled name.\nscore = 10 puts the number 10 in a box labelled score.\n\nprint(name) shows what is inside the box. You can join text with +, like print("Hi " + name).' } },
          { type: 'check', title: 'Quick check', concept: 'variables', content: {
            question: 'You run score = 10 and then score = 15. What is in score now?',
            choices: ['10', '15', '25'], answer: 1,
            explanation: 'A variable holds one value at a time. The second line replaces 10 with 15.' } },
          { type: 'code', title: 'Say hello', concept: 'printing-and-output', content: {
            prompt: 'Make a variable called name that holds "Ada". Then print exactly: Hello, Ada!',
            starter: '# Store the name in a variable\nname = ""\n\n# Print the greeting\n',
            expected_output: 'Hello, Ada!',
            hints: ['What text should go between the quotes on the name line?', 'print() can join pieces of text with +. What comes before the name, and what comes after it?'] } },
        ],
      },
      {
        title: 'Practice and wrap-up',
        activities: [
          { type: 'worksheet', title: 'Variables worksheet', concept: 'variables', content: {
            body: 'This replaces the printed worksheet. Answer in your own words.',
            fields: [
              { label: 'In your own words, what is a variable?', kind: 'long' },
              { label: 'Write one line of Python that stores your favorite food in a variable.', kind: 'text' },
              { label: 'Why does text need quotes in Python, but numbers do not?', kind: 'long' },
            ] } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'What is one thing you learned today, and one thing you are still unsure about?' } },
          { type: 'posttest', title: 'Post-test: show what you learned', content: {
            questions: [
              q('printing-and-output', 'Which line shows Good morning on the screen?', ['say("Good morning")', 'print("Good morning")', '"Good morning"'], 1),
              q('variables', 'Which line stores the word Mesa in a variable named town?', ['town = "Mesa"', 'town == "Mesa"', '"Mesa" = town'], 0),
              q('variables', 'x = 3 then x = 8 then print(x). What appears?', ['3', '8', '11'], 1),
            ] } },
        ],
      },
    ],
  },
  {
    title: 'Loops: make the computer repeat',
    summary: 'Use for loops and range() to repeat work instead of copy-pasting.',
    lessons: [
      {
        title: 'Repeat with for',
        activities: [
          { type: 'pretest', title: 'Pretest: where are you starting?', content: {
            questions: [
              q('loops', 'How many times does this print? for i in range(3): print("hi")', ['2', '3', '4'], 1),
              q('loops', 'What numbers does range(1, 4) give?', ['1, 2, 3, 4', '1, 2, 3', '0, 1, 2, 3'], 1),
              q('loops', 'total = 0; for n in range(1, 4): total = total + n. What is total?', ['3', '6', '10'], 1),
            ] } },
          { type: 'reading', title: 'The for loop', concept: 'loops', content: {
            body: 'A for loop repeats the indented lines underneath it.\n\nfor i in range(5):\n    print(i)\n\nprints 0, 1, 2, 3, 4. range(5) counts from 0 up to, but not including, 5. range(1, 6) counts 1 to 5.\n\nThe colon at the end of the for line and the indent on the next line are required.' } },
          { type: 'check', title: 'Quick check', concept: 'loops', content: {
            question: 'Which loop prints 1, 2, 3, 4, 5?',
            choices: ['for i in range(5): print(i)', 'for i in range(1, 6): print(i)', 'for i in range(1, 5): print(i)'], answer: 1,
            explanation: 'range stops just before its second number, so range(1, 6) gives 1 to 5.' } },
          { type: 'code', title: 'Count to five', concept: 'loops', content: {
            prompt: 'Use a for loop to print the numbers 1 to 5, one per line.',
            starter: '# Use a for loop and range()\n',
            expected_output: '1\n2\n3\n4\n5',
            hints: ['Which range() call starts at 1 and stops after 5?', 'Inside the loop, what do you need to print each time around?'] } },
          { type: 'code', title: 'Add them up', concept: 'loops', content: {
            prompt: 'Make a variable total that ends up holding 1 + 2 + ... + 10 using a loop (not by typing 55). Then print total.',
            starter: 'total = 0\n\n# Loop over the numbers 1 to 10 and add each one to total\n\nprint(total)\n',
            expected_output: '55',
            tests: 'assert total == 55, "total should be 55"',
            hints: ['Your loop needs to visit every number from 1 to 10. Which range() does that?', 'Each time around the loop, total should grow by the current number. How do you write "total becomes total plus n"?'] } },
        ],
      },
      {
        title: 'Practice and wrap-up',
        activities: [
          { type: 'worksheet', title: 'Loops worksheet', concept: 'loops', content: {
            fields: [
              { label: 'Describe something in real life that repeats like a loop.', kind: 'long' },
              { label: 'What numbers does range(2, 7) give you?', kind: 'text' },
            ] } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'When would you use a loop instead of writing the same line many times?' } },
          { type: 'posttest', title: 'Post-test: show what you learned', content: {
            questions: [
              q('loops', 'How many times does this print? for i in range(5): print("go")', ['4', '5', '6'], 1),
              q('loops', 'What numbers does range(2, 5) give?', ['2, 3, 4', '2, 3, 4, 5', '3, 4, 5'], 0),
              q('loops', 'count = 0; for n in range(4): count = count + 1. What is count?', ['3', '4', '6'], 1),
            ] } },
        ],
      },
    ],
  },
  {
    title: 'Decisions with if',
    summary: 'Make programs that choose what to do with if, elif and else.',
    lessons: [
      {
        title: 'If this, then that',
        activities: [
          { type: 'pretest', title: 'Pretest: where are you starting?', content: {
            questions: [
              q('conditionals', 'What does == check?', ['Whether two values are equal', 'Stores a value', 'Adds two values'], 0),
              q('conditionals', 'x = 7; if x > 5: print("big") else: print("small"). What prints?', ['big', 'small', 'both'], 0),
            ] } },
          { type: 'reading', title: 'if, elif and else', concept: 'conditionals', content: {
            body: 'if lets a program choose.\n\nif temp > 100:\n    print("Hot!")\nelse:\n    print("OK")\n\nUse == to compare (two equals signs). One = stores a value.' } },
          { type: 'code', title: 'Even or odd', concept: 'conditionals', content: {
            prompt: 'Write a function is_even(n) that returns True if n is even and False otherwise. n % 2 gives the remainder after dividing by 2.',
            starter: 'def is_even(n):\n    # your code here\n    pass\n',
            tests: 'assert is_even(4) == True, "4 is even"\nassert is_even(7) == False, "7 is odd"\nassert is_even(0) == True, "0 is even"',
            hints: ['What is the remainder when an even number is divided by 2?', 'Your function must return something. What should it return when the remainder is 0?'] } },
          { type: 'exit', title: 'Exit ticket', content: { question: 'Explain the difference between = and == in your own words.' } },
          { type: 'posttest', title: 'Post-test: show what you learned', content: {
            questions: [
              q('conditionals', 'Which line checks whether score is equal to 10?', ['score = 10', 'score == 10', 'score => 10'], 1),
              q('conditionals', 'n = 2; if n > 5: print("yes") else: print("no"). What prints?', ['yes', 'no', 'nothing'], 1),
            ] } },
        ],
      },
    ],
  },
];
