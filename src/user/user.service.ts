import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schema/user.schema';
import { Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { Query } from 'express-serve-static-core';
import { faker, tr } from '@faker-js/faker';
import { genParam } from 'utils/common';
import { MailService } from 'src/mail/mail.service';

import * as bcrypt from 'bcrypt';
import toStream = require('buffer-to-stream');
import * as csv from 'csv-parser';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private mailService: MailService,
  ) {}

  async validateNIM(nim: string) {
    return await this.userModel.findOne({ nim });
  }
  async validateEmail(email: string) {
    return await this.userModel.findOne({ email });
  }
  async isExist(id: string) {
    return await this.userModel.findById(id, '+isAdmin');
  }

  async createUser(body: CreateUserDto) {
    const { isAdmin } = body;

    if (isAdmin) {
      const { nim, email, name, password } = body;
      const pass = await bcrypt.hash(password, 10);
      const response = await this.userModel.create({
        nim,
        email,
        name,
        isAdmin,
        password: pass,
      });

      return response;
    } else {
      const { nim, email, name, yearClass } = body;
      const response = await this.userModel.create({
        nim,
        email,
        name,
        yearClass,
      });
      return response;
    }
  }

  private async parseCsvToJSON(file: Express.Multer.File) {
    const stream = toStream(file.buffer);

    const jsonRows = [];
    return new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          jsonRows.push(row);
        })
        .on('end', () => {
          resolve(jsonRows);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async bulkData(file: Express.Multer.File) {
    const csvData = await this.parseCsvToJSON(file);
    try{
      const res = await this.userModel.insertMany(csvData);
      return res;
    }catch(err){
      throw new BadRequestException("Make sure all email and nim values are unique")
    }
  }

  // FIXME: ALSO DELETE VOTE
  async deleteUserById(id: string): Promise<User> {
    const response = await this.userModel.findByIdAndDelete(id);
    return response;
  }

  async findAllNonAdmin(q: Query): Promise<User[]> {
    const filter: Record<string, any> = {
      nim: String,
      email: String,
      name: String,
      yearClass: Number,
      search: ['nim', 'email', 'name'],
    };

    const { limit, skip, params, sort } = genParam(q, filter);
    const param = { isAdmin: false };
    const response = await this.userModel
      .find({ ...param, ...params }, '-__v')
      .limit(limit)
      .skip(skip)
      .sort(sort);
    return response;
  }

  async findAllAdmin(q: Query): Promise<User[]> {
    const filter: Record<string, any> = {
      nim: String,
      email: String,
      name: String,
      yearClass: Number,
      search: ['nim', 'email', 'name'],
    };
    const { limit, skip, params, sort } = genParam(q, filter);
    const param = { isAdmin: true };
    const response = await this.userModel
      .find({ ...param, ...params }, '-vote -yearClass -__v')
      .limit(limit)
      .skip(skip)
      .sort(sort);
    return response;
  }

  async findUserById(id: string): Promise<User> {
    const response = await this.userModel.findById(id, '-__v');
    return response;
  }

  async sendCredentials(id: string) {
    const random_passwd = faker.string.sample(12);
    const password = await bcrypt.hash(random_passwd, 10);
    const response = await this.userModel.findByIdAndUpdate(id, { password });
    try {
      await this.mailService.sendCred(response, random_passwd)
    } catch (e) {
      throw new BadRequestException('Failed on sending the user credentials')
    }

    return response;
  }

  async updateVoteField(id: string, voted: boolean){
    const response = await this.userModel.findByIdAndUpdate(
      id,
      { voted },
      { new: true, runValidators: true }
    )
    return response
  }

  async login(email_nim: string): Promise<User> {
    const response = await this.userModel.findOne({
      $or: [{ email: email_nim }, { nim: email_nim }],
    }, '+password +isAdmin');
    return response;
  }

  async nonAdminLoginMethod(nim: string): Promise<User>{
    const response = await this.userModel.findOne({ nim }, '+password +isAdmin')
    return response
  }

  async adminLoginMethod(email: string): Promise<User>{
    const response = await this.userModel.findOne({ email }, '+password +isAdmin')
    return response
  }

  async totalNonAdminUser(){
    const response = await this.userModel.countDocuments({ isAdmin: false })
    return response
  }

  async totalAdminUser(){
    const response = await this.userModel.countDocuments({ isAdmin: true })
    return response
  }
}
