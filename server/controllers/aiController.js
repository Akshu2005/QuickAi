import OpenAI from "openai";
import sql from "./../configs/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import pdf from 'pdf-parse/lib/pdf-parse.js';

// ✅ Setup AI client (Gemini via OpenAI SDK style)
const AI = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// 📌 Generate Article
export const generateArticle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, length } = req.body;
    const plan = req.plan;
    const free_usage = req.free_usage;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue.",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: length,
    });

    const content = response.choices[0].message.content;

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${content}, 'article')
    `;

    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: { free_usage: free_usage + 1 },
      });
    }

    res.json({ success: true, content });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// 📌 Generate Blog Title
export const generateBlogTitle = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt } = req.body;
    const plan = req.plan;
    const free_usage = req.free_usage;

    if (plan !== "premium" && free_usage >= 10) {
      return res.json({
        success: false,
        message: "Limit reached. Upgrade to continue.",
      });
    }

    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    const content = response.choices[0].message.content;

    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${prompt}, ${content}, 'blog-title')
    `;

    if (plan !== "premium") {
      await clerkClient.users.updateUserMetadata(userId, {
        privateMetadata: { free_usage: free_usage + 1 },
      });
    }

    res.json({ success: true, content });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// 📌 Generate Image (AI Horde )

export const generateImage = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, publish } = req.body;
    const plan = req.plan;

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium users.",
      });
    }

    if (!process.env.AI_HORDE_API_KEY) {
      throw new Error("AI_HORDE_API_KEY is missing in environment variables");
    }

    // Step 1: Request image generation
    const submit = await axios.post(
      "https://stablehorde.net/api/v2/generate/async",
      {
        prompt,
        steps: 25,
        width: 512,
        height: 512,
        n: 1,
        sampler_name: "k_euler",
      },
      {
        headers: {
          apikey: process.env.AI_HORDE_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const { id } = submit.data;
    if (!id) throw new Error("Failed to get generation ID from AI Horde");

    // Step 2: Poll for completion with timeout
    let imageResult = null;
    let attempts = 0;
    const maxAttempts = 20;

    while (!imageResult && attempts < maxAttempts) {
      const check = await axios.get(
        `https://stablehorde.net/api/v2/generate/status/${id}`
      );

      if (check.data.done && check.data.generations?.length > 0) {
        imageResult = check.data.generations[0];
        if (!imageResult.img) {
          throw new Error("AI Horde returned no image data");
        }
      } else {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    if (!imageResult) throw new Error("Image generation timed out");

    // Step 3: Upload to Cloudinary (handle URL or base64)
    let cloudinaryUploadResult;
    if (imageResult.img.startsWith("http")) {
      cloudinaryUploadResult = await cloudinary.uploader.upload(imageResult.img);
    } else {
      const base64Image = `data:image/png;base64,${imageResult.img}`;
      cloudinaryUploadResult = await cloudinary.uploader.upload(base64Image);
    }

    const secure_url = cloudinaryUploadResult.secure_url;

    // Step 4: Save to database
    await sql`
      INSERT INTO creations (user_id, prompt, content, type, publish)
      VALUES (${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})
    `;

    res.json({ success: true, content: secure_url });
  } catch (error) {
    console.error("AI Horde Full Error:", error);
    res.json({
      success: false,
      message: error.message,
      details: error.response?.data,
    });
  }
};


export const removeImageBackground = async (req, res) => {
  try {
    const userId = req.auth?.userId; // Adjust based on your auth middleware
    const image = req.file; // ✅ Correct usage
    const plan = req.plan; // Ensure plan is set in middleware

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "No image uploaded."
      });
    }

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium users."
      });
    }

    // ✅ Upload to Cloudinary
    const { secure_url } = await cloudinary.uploader.upload(image.path, {
      transformation: [
        {
          effect: 'background_removal',
          background_removal: 'remove_the_background'
        }
      ]
    });

    // ✅ Insert into database
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Remove background from image', ${secure_url}, 'image')`;

    return res.json({
      success: true,
      content: secure_url
    });
  } catch (error) {
    console.error("Image background removal error:", error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const removeImageObject = async (req, res) => {
  try {
    // ✅ Get userId from Clerk auth (use req.auth(), not destructuring directly)
    const authData = req.auth(); // or req.auth if middleware provides it as an object
    const userId = authData?.userId;

    // ✅ Get object name and image
    const { object } = req.body; // ✅ FIXED
    const image = req.file;      // ✅ FIXED
    const plan = req.plan;       // Ensure this comes from middleware

    // ✅ Validate inputs
    if (!image) {
      return res.status(400).json({ success: false, message: "No image uploaded." });
    }

    if (!object) {
      return res.status(400).json({ success: false, message: "Object name is required." });
    }

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium users."
      });
    }

    // ✅ Upload to Cloudinary
    const { public_id } = await cloudinary.uploader.upload(image.path);

    // ✅ Apply object removal transformation
    const imageUrl = cloudinary.url(public_id, {
      transformation: [{ effect: `gen_remove:${object}` }],
      resource_type: "image"
    });

    // ✅ Insert into DB
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, ${`Removed ${object} from image`}, ${imageUrl}, 'image')`;

    return res.json({ success: true, content: imageUrl });
  } catch (error) {
    console.error("Image object removal error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};





export const resumeReview = async (req, res) => {
  try {
    // ✅ Get userId from Clerk auth properly
    const authData = req.auth();
    const userId = authData?.userId;

    const resume = req.file; // ✅ FIXED
    const plan = req.plan;

    if (!resume) {
      return res.status(400).json({ success: false, message: "No resume uploaded." });
    }

    if (plan !== "premium") {
      return res.json({
        success: false,
        message: "This feature is only available for premium users."
      });
    }

    // ✅ Validate file size
    if (resume.size > 5 * 1024 * 1024) {
      return res.json({
        success: false,
        message: "Resume file size exceeds allowed size (5MB)."
      });
    }

    // ✅ Read and parse PDF
    const dataBuffer = fs.readFileSync(resume.path);
    const pdfData = await pdf(dataBuffer);

    const prompt = `Review the following resume and provide constructive feedback on its strengths, weaknesses, and areas for improvement. Resume Content:\n\n${pdfData.text}`;

    // ✅ Call AI API
    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;

    // ✅ Save to database
    await sql`
      INSERT INTO creations (user_id, prompt, content, type)
      VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')`;

    return res.json({ success: true, content });
  } catch (error) {
    console.error("Resume review error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
