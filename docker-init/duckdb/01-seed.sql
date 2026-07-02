CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  slug VARCHAR NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL UNIQUE,
  role VARCHAR DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  title VARCHAR NOT NULL,
  body TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) NOT NULL,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO organizations VALUES
  (1, 'Acme Inc', 'acme', CURRENT_TIMESTAMP),
  (2, 'Globex Corp', 'globex', CURRENT_TIMESTAMP),
  (3, 'Initech', 'initech', CURRENT_TIMESTAMP),
  (4, 'Umbrella Co', 'umbrella', CURRENT_TIMESTAMP);

INSERT INTO users VALUES
  (1, 1, 'Alice', 'alice@acme.com', 'admin', CURRENT_TIMESTAMP),
  (2, 1, 'Bob', 'bob@acme.com', 'member', CURRENT_TIMESTAMP),
  (3, 1, 'Charlie', 'charlie@acme.com', 'member', CURRENT_TIMESTAMP),
  (4, 2, 'Carol', 'carol@globex.com', 'admin', CURRENT_TIMESTAMP),
  (5, 2, 'David', 'david@globex.com', 'member', CURRENT_TIMESTAMP),
  (6, 2, 'Eve', 'eve@globex.com', 'member', CURRENT_TIMESTAMP),
  (7, 3, 'Frank', 'frank@initech.com', 'admin', CURRENT_TIMESTAMP),
  (8, 3, 'Grace', 'grace@initech.com', 'member', CURRENT_TIMESTAMP),
  (9, 4, 'Hank', 'hank@umbrella.com', 'admin', CURRENT_TIMESTAMP),
  (10, 4, 'Ivy', 'ivy@umbrella.com', 'member', CURRENT_TIMESTAMP);

INSERT INTO posts VALUES
  (1, 1, 'Hello World', 'This is the first post.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 1, 'Getting Started with SQL', 'SQL is a powerful language for managing data.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 1, 'Advanced Queries', 'Learn about joins, subqueries, and CTEs.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 2, 'My First Draft', 'Not published yet.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (5, 2, 'Tips for Beginners', 'Start with the basics and practice daily.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (6, 3, 'Database Design', 'Normalization and indexing explained.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (7, 4, 'Company Announcement', 'Welcome to Globex!', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (8, 4, 'Q4 Results', 'Quarterly performance review.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (9, 5, 'Tech Stack Overview', 'Our technology choices for 2026.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (10, 6, 'Remote Work Guide', 'Best practices for distributed teams.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (11, 7, 'Project Alpha', 'Introducing our new flagship product.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (12, 8, 'Team Building', 'Activities that bring people together.', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (13, 9, 'Security Best Practices', 'Keeping your data safe.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (14, 10, 'Onboarding Checklist', 'A guide for new hires.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO comments VALUES
  (1, 1, 2, 'Great post!', CURRENT_TIMESTAMP),
  (2, 1, 3, 'Thanks for sharing.', CURRENT_TIMESTAMP),
  (3, 2, 2, 'Very helpful, thanks!', CURRENT_TIMESTAMP),
  (4, 2, 4, 'Well written.', CURRENT_TIMESTAMP),
  (5, 3, 5, 'Could you add more examples?', CURRENT_TIMESTAMP),
  (6, 3, 6, 'This cleared up a lot of confusion.', CURRENT_TIMESTAMP),
  (7, 5, 1, 'Great tips for newcomers.', CURRENT_TIMESTAMP),
  (8, 6, 7, 'Excellent explanation of B-tree indexes.', CURRENT_TIMESTAMP),
  (9, 7, 8, 'Exciting news!', CURRENT_TIMESTAMP),
  (10, 9, 9, 'Interesting tech choices.', CURRENT_TIMESTAMP),
  (11, 10, 10, 'Saving this for my team.', CURRENT_TIMESTAMP),
  (12, 11, 1, 'Can not wait for the launch!', CURRENT_TIMESTAMP),
  (13, 13, 2, 'This should be required reading.', CURRENT_TIMESTAMP),
  (14, 14, 3, 'Perfect timing, we just hired two people.', CURRENT_TIMESTAMP);

CREATE TABLE article_embeddings (
  id INTEGER PRIMARY KEY,
  title VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  embedding FLOAT[3] NOT NULL
);

INSERT INTO article_embeddings VALUES
  (1, 'Vector basics', 'ml', [0.10, 0.20, 0.30]),
  (2, 'Nearest neighbors', 'ml', [0.12, 0.18, 0.27]),
  (3, 'Finance report', 'business', [0.80, 0.10, 0.05]),
  (4, 'Marketing copy', 'content', [0.55, 0.42, 0.11]);

