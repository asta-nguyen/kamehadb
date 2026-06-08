DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS organizations;

CREATE TABLE organizations (
  id UInt32,
  name String,
  slug String,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY id;

CREATE TABLE users (
  id UInt32,
  org_id UInt32,
  name String,
  email String,
  role String DEFAULT 'member',
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY id;

CREATE TABLE posts (
  id UInt32,
  user_id UInt32,
  title String,
  body String,
  published UInt8 DEFAULT 0,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3),
  updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY id;

CREATE TABLE comments (
  id UInt32,
  post_id UInt32,
  user_id UInt32,
  body String,
  created_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
ORDER BY id;

INSERT INTO organizations (id, name, slug) VALUES
  (1, 'Acme Inc', 'acme'),
  (2, 'Globex Corp', 'globex'),
  (3, 'Initech', 'initech'),
  (4, 'Umbrella Co', 'umbrella');

INSERT INTO users (id, org_id, name, email, role) VALUES
  (1, 1, 'Alice', 'alice@acme.com', 'admin'),
  (2, 1, 'Bob', 'bob@acme.com', 'member'),
  (3, 1, 'Charlie', 'charlie@acme.com', 'member'),
  (4, 2, 'Carol', 'carol@globex.com', 'admin'),
  (5, 2, 'David', 'david@globex.com', 'member'),
  (6, 2, 'Eve', 'eve@globex.com', 'member'),
  (7, 3, 'Frank', 'frank@initech.com', 'admin'),
  (8, 3, 'Grace', 'grace@initech.com', 'member'),
  (9, 4, 'Hank', 'hank@umbrella.com', 'admin'),
  (10, 4, 'Ivy', 'ivy@umbrella.com', 'member');

INSERT INTO posts (id, user_id, title, body, published) VALUES
  (1, 1, 'Hello World', 'This is the first post.', 1),
  (2, 1, 'Getting Started with SQL', 'SQL is a powerful language for managing data.', 1),
  (3, 1, 'Advanced Queries', 'Learn about joins, subqueries, and CTEs.', 1),
  (4, 2, 'My First Draft', 'Not published yet.', 0),
  (5, 2, 'Tips for Beginners', 'Start with the basics and practice daily.', 1),
  (6, 3, 'Database Design', 'Normalization and indexing explained.', 1),
  (7, 4, 'Company Announcement', 'Welcome to Globex!', 1),
  (8, 4, 'Q4 Results', 'Quarterly performance review.', 1),
  (9, 5, 'Tech Stack Overview', 'Our technology choices for 2026.', 1),
  (10, 6, 'Remote Work Guide', 'Best practices for distributed teams.', 1),
  (11, 7, 'Project Alpha', 'Introducing our new flagship product.', 1),
  (12, 8, 'Team Building', 'Activities that bring people together.', 0),
  (13, 9, 'Security Best Practices', 'Keeping your data safe.', 1),
  (14, 10, 'Onboarding Checklist', 'A guide for new hires.', 1);

INSERT INTO comments (id, post_id, user_id, body) VALUES
  (1, 1, 2, 'Great post!'),
  (2, 1, 3, 'Thanks for sharing.'),
  (3, 2, 2, 'Very helpful, thanks!'),
  (4, 2, 4, 'Well written.'),
  (5, 3, 5, 'Could you add more examples?'),
  (6, 3, 6, 'This cleared up a lot of confusion.'),
  (7, 5, 1, 'Great tips for newcomers.'),
  (8, 6, 7, 'Excellent explanation of B-tree indexes.'),
  (9, 7, 8, 'Exciting news!'),
  (10, 9, 9, 'Interesting tech choices.'),
  (11, 10, 10, 'Saving this for my team.'),
  (12, 11, 1, 'Can not wait for the launch!'),
  (13, 13, 2, 'This should be required reading.'),
  (14, 14, 3, 'Perfect timing, we just hired two people.');

