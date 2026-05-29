CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) NOT NULL,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO organizations (name, slug) VALUES
  ('Acme Inc', 'acme'),
  ('Globex Corp', 'globex'),
  ('Initech', 'initech'),
  ('Umbrella Co', 'umbrella');

INSERT INTO users (org_id, name, email, role) VALUES
  (1, 'Alice', 'alice@acme.com', 'admin'),
  (1, 'Bob', 'bob@acme.com', 'member'),
  (1, 'Charlie', 'charlie@acme.com', 'member'),
  (2, 'Carol', 'carol@globex.com', 'admin'),
  (2, 'David', 'david@globex.com', 'member'),
  (2, 'Eve', 'eve@globex.com', 'member'),
  (3, 'Frank', 'frank@initech.com', 'admin'),
  (3, 'Grace', 'grace@initech.com', 'member'),
  (4, 'Hank', 'hank@umbrella.com', 'admin'),
  (4, 'Ivy', 'ivy@umbrella.com', 'member');

INSERT INTO posts (user_id, title, body, published) VALUES
  (1, 'Hello World', 'This is the first post.', true),
  (1, 'Getting Started with SQL', 'SQL is a powerful language for managing data.', true),
  (1, 'Advanced Queries', 'Learn about joins, subqueries, and CTEs.', true),
  (2, 'My First Draft', 'Not published yet.', false),
  (2, 'Tips for Beginners', 'Start with the basics and practice daily.', true),
  (3, 'Database Design', 'Normalization and indexing explained.', true),
  (4, 'Company Announcement', 'Welcome to Globex!', true),
  (4, 'Q4 Results', 'Quarterly performance review.', true),
  (5, 'Tech Stack Overview', 'Our technology choices for 2026.', true),
  (6, 'Remote Work Guide', 'Best practices for distributed teams.', true),
  (7, 'Project Alpha', 'Introducing our new flagship product.', true),
  (8, 'Team Building', 'Activities that bring people together.', false),
  (9, 'Security Best Practices', 'Keeping your data safe.', true),
  (10, 'Onboarding Checklist', 'A guide for new hires.', true);

INSERT INTO comments (post_id, user_id, body) VALUES
  (1, 2, 'Great post!'),
  (1, 3, 'Thanks for sharing.'),
  (2, 2, 'Very helpful, thanks!'),
  (2, 4, 'Well written.'),
  (3, 5, 'Could you add more examples?'),
  (3, 6, 'This cleared up a lot of confusion.'),
  (5, 1, 'Great tips for newcomers.'),
  (6, 7, 'Excellent explanation of B-tree indexes.'),
  (7, 8, 'Exciting news!'),
  (9, 9, 'Interesting tech choices.'),
  (10, 10, 'Saving this for my team.'),
  (11, 1, 'Can not wait for the launch!'),
  (13, 2, 'This should be required reading.'),
  (14, 3, 'Perfect timing, we just hired two people.');
