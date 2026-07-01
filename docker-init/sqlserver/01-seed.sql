DROP TABLE IF EXISTS dbo.comments;
DROP TABLE IF EXISTS dbo.posts;
DROP TABLE IF EXISTS dbo.users;
DROP TABLE IF EXISTS dbo.organizations;

CREATE TABLE dbo.organizations (
  id INT NOT NULL PRIMARY KEY,
  name NVARCHAR(255) NOT NULL,
  slug NVARCHAR(100) NOT NULL UNIQUE,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.users (
  id INT NOT NULL PRIMARY KEY,
  org_id INT NULL REFERENCES dbo.organizations(id),
  name NVARCHAR(255) NOT NULL,
  email NVARCHAR(255) NOT NULL UNIQUE,
  role NVARCHAR(50) NOT NULL DEFAULT 'member',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.posts (
  id INT NOT NULL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES dbo.users(id),
  title NVARCHAR(255) NOT NULL,
  body NVARCHAR(MAX) NULL,
  published BIT NOT NULL DEFAULT 0,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.comments (
  id INT NOT NULL PRIMARY KEY,
  post_id INT NOT NULL REFERENCES dbo.posts(id),
  user_id INT NOT NULL REFERENCES dbo.users(id),
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

INSERT INTO dbo.organizations (id, name, slug) VALUES
  (1, 'Acme Inc', 'acme'),
  (2, 'Globex Corp', 'globex'),
  (3, 'Initech', 'initech'),
  (4, 'Umbrella Co', 'umbrella');

INSERT INTO dbo.users (id, org_id, name, email, role) VALUES
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

INSERT INTO dbo.posts (id, user_id, title, body, published) VALUES
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

INSERT INTO dbo.comments (id, post_id, user_id, body) VALUES
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

-- Vector sample data for SQL Server 2025 VECTOR type
DROP TABLE IF EXISTS dbo.documents;
CREATE TABLE dbo.documents (
  id INT NOT NULL PRIMARY KEY,
  title NVARCHAR(255) NOT NULL,
  body NVARCHAR(MAX) NULL,
  embedding VECTOR(4) NOT NULL
);

INSERT INTO dbo.documents (id, title, body, embedding) VALUES
  (1, 'Intro to Vectors', 'Understanding vector embeddings.', '[0.1, 0.2, 0.3, 0.4]'),
  (2, 'Similarity Search', 'How cosine distance works.', '[0.15, 0.25, 0.35, 0.45]'),
  (3, 'Database Indexing', 'B-tree vs vector index.', '[0.9, 0.1, 0.05, 0.2]'),
  (4, 'Machine Learning', 'Training neural networks.', '[0.2, 0.4, 0.6, 0.8]'),
  (5, 'Data Pipelines', 'ETL best practices.', '[0.3, 0.1, 0.5, 0.7]'),
  (6, 'Cloud Native', 'Containers and orchestration.', '[0.8, 0.7, 0.1, 0.3]'),
  (7, 'Security Basics', 'Authentication patterns.', '[0.1, 0.9, 0.2, 0.1]'),
  (8, 'REST API Design', 'Building robust APIs.', '[0.4, 0.3, 0.2, 0.1]'),
  (9, 'GraphQL Patterns', 'Schema design tips.', '[0.45, 0.35, 0.25, 0.15]'),
  (10, 'Observability', 'Logs, metrics, and traces.', '[0.6, 0.5, 0.4, 0.3]');

